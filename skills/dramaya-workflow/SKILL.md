---
name: dramaya-workflow
description: Use when working on Dramaya project coordination, including 今天任务, 开始任务, 收工, 插入需求, Plane work items, GitHub PR flow, cycles, versions, testing, release handoff, or two-person Codex collaboration.
---

# Dramaya Workflow

## 核心原则

这是 Dramaya 两人团队的固定协作技能。目标是让用户用短口令推进工作，而不是每次重新解释项目流程。

固定映射：

| 用户口令 | Codex 要做什么 |
| --- | --- |
| `今天任务` | 汇总 Plane 当前 Cycle、GitHub/本地状态，给出今天推荐顺序 |
| `开始第 N 个` / `开始 DRAMA-123` | 锁定一个 Plane 事项，切分支/工作区，状态改为 Doing |
| `插一个需求` | 先做优先级判断，决定进 Backlog、当前 Cycle 或立即插队 |
| `收工` | 检查 diff、跑必要验证、提交/PR 建议、状态改为 Review 或 Testing |
| `测试完成` | 回归验证后把事项推进 Done，并记录版本/发布影响 |

## 项目事实

- 本地仓库：`/Users/joker/Documents/dramaya`
- Plane workspace：`dramaya`
- Plane project：`Dramaya`
- Plane project id：`e0b15c26-18d9-44b8-a902-b309f8977415`
- 当前协作模式：小伙伴是主负责人，用户是搭档
- 一个 Plane Issue = 一个短生命周期 Git 分支 = 一个 Codex 会话
- 不在 `main` 直接开发，除非用户明确要求做极小文档或配置修正
- Plane API Key 优先从环境变量 `PLANE_API_KEY` 读取，也可从 macOS 钥匙串服务 `dramaya-plane-api-key` 读取；不得写入仓库、HTML 或技能文件

推荐状态流：

`Backlog` -> `Ready` -> `Doing` -> `Review` -> `Testing` -> `Done`

已建标签：

`P0`, `P1`, `P2`, `P3`, `feature`, `bug`, `test`, `docs`, `chore`, `web`, `api`, `worker`, `db`, `docker`, `asset-hub`, `prompt-library`, `open-studio`, `deploy`, `blocked`, `needs-review`, `needs-deploy`

## 每次开始前

1. 确认用户口令属于哪个流程。
2. 优先使用辅助脚本读取 Plane：

```bash
python3 ~/.codex/skills/dramaya-workflow/scripts/plane_dramaya.py today --repo /Users/joker/Documents/dramaya
```

3. 如果没有 Plane API Key，只提示一次设置方式，然后用 GitHub、本地 git 状态和用户上下文兜底：

```bash
export PLANE_API_KEY='你的 Plane API Key'
```

macOS 推荐用钥匙串存一次：

```bash
security add-generic-password -a "$USER" -s dramaya-plane-api-key -w '你的 Plane API Key' -U
```

4. 开发前读取项目本身的 `AGENTS.md`、相关 README、目标模块文件。不要凭记忆改代码。

## 今天任务

触发词：`今天任务`、`我今天做什么`、`今日安排`、`站会`、`daily`。

执行：

1. 运行 `plane_dramaya.py today --repo /Users/joker/Documents/dramaya`。
2. 汇总当前 Cycle 内未完成事项，按 `P0 > P1 > P2 > P3`、阻塞状态、依赖关系排序。
3. 输出四块内容：
   - 昨天/上次遗留：未完成、Review、Testing、blocked
   - 今天建议：最多 3 件，说明为什么先做
   - 可插队风险：会影响 Cycle 的事项
   - 建议口令：例如 `开始第 1 个`
4. 不要自动改代码；等用户说开始。

## 开始任务

触发词：`开始第 N 个`、`开始 DRAMA-123`、`做这个`、`进入开发`。

执行：

1. 明确唯一 Plane Issue；如果不唯一，向用户确认。
2. 把 Plane 状态改为 `Doing`：

```bash
python3 ~/.codex/skills/dramaya-workflow/scripts/plane_dramaya.py set-state DRAMA-123 Doing
```

3. 更新本地：

```bash
git fetch origin
git switch main
git pull --ff-only origin main
```

4. 创建短分支，默认格式：

```bash
git switch -c codex/drama-123-short-topic
```

5. 调研相关文件后再实现。需要并行多个任务时，优先用 git worktree 隔离。
6. 关键代码改动后检查是否影响 Docker、README、环境变量或迁移。

## 插一个需求

触发词：`插一个需求`、`临时需求`、`顺手做一下`、`新开一个 bug`。

执行：

1. 先 triage，不直接写代码。
2. 判断：
   - 影响今天主线且紧急：进当前 Cycle，标 `P0/P1`
   - 重要但不紧急：进 Backlog 或 Ready，标 `P1/P2`
   - 模糊想法：建为待澄清事项，标 `P3`
3. 明确是否会打断当前分支。如果会，先把当前工作保存为 commit 或 stash，并说明风险。
4. 新需求建议新会话/新分支处理；并行任务不要混在同一个未完成 diff 里。

## 收工

触发词：`收工`、`今天结束`、`任务完成`、`下班前整理`、`finish`。

执行：

1. 检查 `git status --short` 和 diff，只总结本次相关改动。
2. 按改动范围运行最小必要验证。Dramaya 常用：

```bash
bun run check-types
```

3. 如果改了 API、数据库、Docker、环境变量、部署流程，要检查 README/Docker 是否需要同步。
4. 有可提交成果时：
   - commit message 关联 Plane Issue
   - 创建/建议创建 PR
   - Plane 状态改为 `Review`
5. 如果需要人工测试或服务器重建，状态改为 `Testing` 或保留 `Review`，并直接给出命令/测试点。
6. 输出三件事：已完成、未完成/风险、明天第一步。

## GitHub 与 Review

- Codex 产出的代码也必须走 PR Review。
- 修 review 评论时使用 GitHub 相关能力；修 CI 时优先使用 `github:gh-fix-ci`。
- PR 标题建议：`DRAMA-123: 简短动词短语`
- PR 描述至少包含：对应 Plane Issue、改动范围、验证结果、是否需要 Docker 重建。
- 合入后再把 Plane 推进 `Testing` 或 `Done`。

## 小伙伴安装

从开源技能仓库安装：

```bash
mkdir -p ~/.codex/skills
git clone https://github.com/SamsonSir/opc-custom-skills.git ~/opc-custom-skills
cp -R ~/opc-custom-skills/skills/dramaya-workflow ~/.codex/skills/dramaya-workflow
```

小伙伴还需要：

```bash
security add-generic-password -a "$USER" -s dramaya-plane-api-key -w '他自己的 Plane API Key' -U
gh auth login
```

安装后重启 Codex。他也可以直接说：

- `今天任务`
- `开始 DRAMA-123`
- `插一个需求`
- `收工`

## 注意事项

- 不要把密钥写进任何项目文件。
- 不要让多个会话同时改同一批文件；并行开发必须拆任务、拆分支。
- 如果浏览器看到的是 Docker 旧容器，不要声称页面已验证新功能；先给出重建命令。
- 如果用户的判断和 Plane/Git/GitHub 事实冲突，直接指出事实。
