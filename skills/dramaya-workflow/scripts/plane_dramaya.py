#!/usr/bin/env python3
"""Small Plane helper for the Dramaya workflow skill.

This script never stores secrets. Set PLANE_API_KEY in the shell/session.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path
from typing import Any


BASE_URL = os.environ.get("PLANE_BASE_URL", "https://api.plane.so").rstrip("/")
WORKSPACE = os.environ.get("DRAMAYA_PLANE_WORKSPACE", "dramaya")
PROJECT_ID = os.environ.get(
    "DRAMAYA_PLANE_PROJECT_ID", "e0b15c26-18d9-44b8-a902-b309f8977415"
)
DEFAULT_REPO = os.environ.get("DRAMAYA_REPO", "/Users/joker/Documents/dramaya")
DONE_STATE_NAMES = {"done", "cancelled", "canceled"}
PRIORITY_ORDER = {"urgent": 0, "high": 1, "medium": 2, "low": 3, "none": 4}


class PlaneError(RuntimeError):
    pass


def token() -> str:
    value = os.environ.get("PLANE_API_KEY", "").strip()
    if value:
        return value

    key_file = os.environ.get("PLANE_API_KEY_FILE", "").strip()
    if key_file:
        path = Path(key_file).expanduser()
        if path.exists():
            value = path.read_text(encoding="utf-8").strip()
            if value:
                return value

    security = Path("/usr/bin/security")
    if security.exists():
        try:
            value = subprocess.check_output(
                [
                    str(security),
                    "find-generic-password",
                    "-s",
                    "dramaya-plane-api-key",
                    "-w",
                ],
                text=True,
                stderr=subprocess.DEVNULL,
            ).strip()
            if value:
                return value
        except subprocess.CalledProcessError:
            pass

    if not value:
        raise PlaneError(
            "缺少 Plane API Key。请设置 PLANE_API_KEY，或把 Key 存入 macOS 钥匙串服务 dramaya-plane-api-key。"
        )
    return value


def api(
    method: str,
    path: str,
    payload: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None,
) -> Any:
    if not path.startswith("/"):
        path = "/" + path
    url = BASE_URL + path
    if query:
        clean_query = {k: v for k, v in query.items() if v is not None}
        url += "?" + urllib.parse.urlencode(clean_query)

    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")

    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "x-api-key": token(),
        "Authorization": f"Bearer {token()}",
    }
    request = urllib.request.Request(url, data=data, method=method, headers=headers)

    last_error: Exception | None = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=25) as response:
                body = response.read().decode("utf-8")
                return json.loads(body) if body else None
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise PlaneError(f"{method} {path} 返回 {exc.code}: {detail}") from exc
        except urllib.error.URLError as exc:
            last_error = exc
            if attempt < 2:
                time.sleep(0.8 * (attempt + 1))
                continue
            raise PlaneError(f"{method} {path} 网络失败: {exc}") from exc
    raise PlaneError(str(last_error))


def project_path(resource: str) -> str:
    return f"/api/v1/workspaces/{WORKSPACE}/projects/{PROJECT_ID}/{resource.strip('/')}/"


def normalize_list(response: Any) -> list[dict[str, Any]]:
    if isinstance(response, list):
        return [x for x in response if isinstance(x, dict)]
    if isinstance(response, dict):
        for key in ("results", "data", "items"):
            if isinstance(response.get(key), list):
                return [x for x in response[key] if isinstance(x, dict)]
    return []


def get_many(resource: str) -> list[dict[str, Any]]:
    return normalize_list(api("GET", project_path(resource)))


def get_work_items() -> tuple[str, list[dict[str, Any]]]:
    errors: list[str] = []
    for resource in ("work-items", "issues"):
        try:
            return resource, get_many(resource)
        except PlaneError as exc:
            errors.append(str(exc))
    raise PlaneError("无法读取 work items/issues: " + " | ".join(errors))


def item_key(item: dict[str, Any]) -> str:
    identifier = item.get("identifier") or item.get("project_identifier") or "DRAMA"
    sequence = item.get("sequence_id") or item.get("sequence") or item.get("number")
    if sequence:
        return f"{identifier}-{sequence}" if "-" not in str(sequence) else str(sequence)
    return str(item.get("id", ""))[:8]


def item_state_name(item: dict[str, Any], states_by_id: dict[str, str] | None = None) -> str:
    state = item.get("state")
    if isinstance(state, dict):
        return str(state.get("name") or state.get("display_name") or "")
    state_detail = item.get("state_detail")
    if isinstance(state_detail, dict):
        return str(state_detail.get("name") or "")
    state_id = item.get("state_id") or item.get("state")
    if states_by_id and state_id in states_by_id:
        return states_by_id[state_id]
    return str(state_id or "")


def item_priority(item: dict[str, Any]) -> str:
    return str(item.get("priority") or item.get("priority_label") or "none").lower()


def current_cycle(cycles: list[dict[str, Any]]) -> dict[str, Any] | None:
    today = date.today().isoformat()
    dated = []
    for cycle in cycles:
        start = str(cycle.get("start_date") or "")
        end = str(cycle.get("end_date") or "")
        if start and end and start <= today <= end:
            return cycle
        if start:
            dated.append(cycle)
    if dated:
        return sorted(dated, key=lambda x: str(x.get("start_date") or ""), reverse=True)[0]
    return cycles[0] if cycles else None


def belongs_to_cycle(item: dict[str, Any], cycle_id: str | None) -> bool:
    if not cycle_id:
        return True
    candidates = [
        item.get("cycle_id"),
        item.get("cycle"),
        item.get("cycle_detail", {}).get("id") if isinstance(item.get("cycle_detail"), dict) else None,
    ]
    cycles = item.get("cycles")
    if isinstance(cycles, list):
        candidates.extend(c.get("id") if isinstance(c, dict) else c for c in cycles)
    return cycle_id in {str(x) for x in candidates if x}


def state_maps() -> tuple[list[dict[str, Any]], dict[str, str], dict[str, str]]:
    states = get_many("states")
    by_id = {str(s.get("id")): str(s.get("name")) for s in states if s.get("id")}
    by_name = {str(s.get("name")).lower(): str(s.get("id")) for s in states if s.get("id")}
    return states, by_id, by_name


def run_git(repo: str, args: list[str]) -> str:
    path = Path(repo)
    if not path.exists():
        return ""
    try:
        return subprocess.check_output(
            ["git", *args], cwd=path, text=True, stderr=subprocess.STDOUT
        ).strip()
    except subprocess.CalledProcessError as exc:
        return exc.output.strip()


def print_json(data: Any) -> None:
    print(json.dumps(data, ensure_ascii=False, indent=2))


def cmd_config(_: argparse.Namespace) -> None:
    print_json(
        {
            "base_url": BASE_URL,
            "workspace": WORKSPACE,
            "project_id": PROJECT_ID,
            "repo": DEFAULT_REPO,
            "has_plane_api_key": bool(os.environ.get("PLANE_API_KEY")),
            "supports_keychain_service": "dramaya-plane-api-key",
        }
    )


def cmd_list(args: argparse.Namespace) -> None:
    if args.resource == "issues":
        _, items = get_work_items()
    else:
        items = get_many(args.resource)
    print_json(items)


def cmd_today(args: argparse.Namespace) -> None:
    cycles = get_many("cycles")
    cycle = current_cycle(cycles)
    cycle_id = str(cycle.get("id")) if cycle and cycle.get("id") else None
    _, states_by_id, _ = state_maps()
    _, items = get_work_items()

    active_items = []
    for item in items:
        state_name = item_state_name(item, states_by_id).lower()
        if state_name in DONE_STATE_NAMES:
            continue
        if belongs_to_cycle(item, cycle_id):
            active_items.append(item)

    active_items.sort(
        key=lambda item: (
            PRIORITY_ORDER.get(item_priority(item), 9),
            str(item.get("sort_order") or ""),
            item_key(item),
        )
    )

    output_items = [
        {
            "key": item_key(item),
            "id": item.get("id"),
            "title": item.get("name") or item.get("title"),
            "state": item_state_name(item, states_by_id),
            "priority": item_priority(item),
            "assignees": item.get("assignees") or item.get("assignee_ids") or [],
            "labels": item.get("labels") or item.get("label_ids") or [],
        }
        for item in active_items[:30]
    ]

    print_json(
        {
            "cycle": {
                "name": cycle.get("name") if cycle else None,
                "id": cycle_id,
                "start_date": cycle.get("start_date") if cycle else None,
                "end_date": cycle.get("end_date") if cycle else None,
            },
            "items": output_items,
            "git": {
                "repo": args.repo,
                "branch": run_git(args.repo, ["branch", "--show-current"]),
                "status": run_git(args.repo, ["status", "--short"]),
            },
        }
    )


def resolve_item(ref: str, items: list[dict[str, Any]]) -> dict[str, Any]:
    wanted = ref.strip().lower().lstrip("#")
    matches = []
    for item in items:
        keys = {
            str(item.get("id", "")).lower(),
            str(item.get("sequence_id", "")).lower(),
            item_key(item).lower(),
        }
        if wanted in keys:
            matches.append(item)
    if not matches:
        raise PlaneError(f"找不到事项：{ref}")
    if len(matches) > 1:
        raise PlaneError(f"匹配到多个事项：{ref}")
    return matches[0]


def cmd_set_state(args: argparse.Namespace) -> None:
    resource, items = get_work_items()
    _, _, states_by_name = state_maps()
    state_id = states_by_name.get(args.state.strip().lower())
    if not state_id:
        raise PlaneError(f"找不到状态：{args.state}")

    item = resolve_item(args.ref, items)
    path = project_path(resource) + f"{item['id']}/"
    payloads = ({"state_id": state_id}, {"state": state_id})
    last_error = ""
    for payload in payloads:
        try:
            updated = api("PATCH", path, payload)
            print_json({"updated": True, "item": item_key(item), "state": args.state, "response": updated})
            return
        except PlaneError as exc:
            last_error = str(exc)
    raise PlaneError(last_error)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Dramaya Plane workflow helper")
    sub = parser.add_subparsers(dest="command", required=True)

    config = sub.add_parser("config")
    config.set_defaults(func=cmd_config)

    list_cmd = sub.add_parser("list")
    list_cmd.add_argument(
        "resource",
        choices=["cycles", "states", "labels", "modules", "issues"],
    )
    list_cmd.set_defaults(func=cmd_list)

    today = sub.add_parser("today")
    today.add_argument("--repo", default=DEFAULT_REPO)
    today.set_defaults(func=cmd_today)

    set_state = sub.add_parser("set-state")
    set_state.add_argument("ref", help="Plane item id, sequence id, or DRAMA-123")
    set_state.add_argument("state", help="Target state name, for example Doing or Review")
    set_state.set_defaults(func=cmd_set_state)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        args.func(args)
    except PlaneError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
