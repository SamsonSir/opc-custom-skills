#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  connectToTarget,
  listTargets,
  sleep,
} = require("./lib/qc_cdp");

const CREATE_SCRIPT = path.join(__dirname, "create_qianchuan_plan.js");
const FEISHU_NOTIFY_SCRIPT = process.env.FEISHU_NOTIFY_SCRIPT || "";

function usage() {
  console.error(`用法:
  batch_create_qianchuan_plans.js --input <plans.json> [--dry-run] [--publish] [--no-publish] [--no-notify]

plans.json 格式:
[
  {
    "product_id": "1234567890123456789",
    "product_name": "示例商品名称",
    "sale_price": 299,
    "unit_cost": 40,
    "sign_rate": 0.55,
    "ship_rate": 0.9,
    "material_dir": "/path/to/clip_outputs/02_商品名",
    "daily_budget": 300
  }
]

说明:
  批量模式按“单商品单计划”执行：一次只处理一个商品，一个干净创建页只对应一个商品。
  默认自动点击发布计划，发布成功后继续下一个商品。
  需要只配置到发布前时，显式传 --no-publish。
  真实批量结束后默认发送飞书应用内加急通知；如需跳过，传 --no-notify。
`);
}

function nowIso() {
  return new Date().toISOString();
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (hours) parts.push(`${hours}小时`);
  if (minutes || hours) parts.push(`${minutes}分`);
  parts.push(`${seconds}秒`);
  return parts.join("");
}

function buildTiming(startMs, startedAt) {
  const endedAt = nowIso();
  const elapsedMs = Date.now() - startMs;
  return {
    started_at: startedAt,
    ended_at: endedAt,
    elapsed_ms: elapsedMs,
    elapsed_human: formatDuration(elapsedMs),
  };
}

function parseArgs(argv) {
  const cfg = { dry_run: false, publish: true, notify: true };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      i += 1;
      if (i >= argv.length) throw new Error(`${arg} 缺少值`);
      return argv[i];
    };

    if (arg === "--input") cfg.input = next();
    else if (arg === "--dry-run") cfg.dry_run = true;
    else if (arg === "--publish") cfg.publish = true;
    else if (arg === "--no-publish") cfg.publish = false;
    else if (arg === "--no-notify") cfg.notify = false;
    else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    } else throw new Error(`未知参数: ${arg}`);
  }
  if (!cfg.input) throw new Error("缺少 --input");
  cfg.input = path.resolve(cfg.input);
  return cfg;
}

function argsForPlan(plan, dryRun, publish) {
  const shouldPublish = publish && plan.publish !== false && !plan.no_publish;
  const args = [
    CREATE_SCRIPT,
    "--product-id",
    String(plan.product_id),
    "--sale-price",
    String(plan.sale_price),
    "--unit-cost",
    String(plan.unit_cost),
    "--sign-rate",
    String(plan.sign_rate),
    "--ship-rate",
    String(plan.ship_rate == null ? 0.9 : plan.ship_rate),
    "--material-dir",
    String(plan.material_dir),
  ];

  if (plan.product_name) args.push("--product-name", String(plan.product_name));
  if (plan.title) args.push("--title", String(plan.title));
  if (plan.daily_budget) args.push("--daily-budget", String(plan.daily_budget));
  if (shouldPublish) args.push("--publish");
  else args.push("--no-publish");
  if (dryRun) args.push("--dry-run");
  return args;
}

function runPlan(plan, dryRun, publish) {
  const startMs = Date.now();
  const startedAt = nowIso();
  const res = spawnSync("node", argsForPlan(plan, dryRun, publish), { encoding: "utf8" });
  let payload = null;
  try {
    payload = JSON.parse(res.stdout);
  } catch (_) {
    payload = null;
  }

  return {
    product_id: String(plan.product_id || ""),
    ok: res.status === 0,
    status: res.status,
    stdout: payload || res.stdout,
    stderr: res.stderr,
    timing: buildTiming(startMs, startedAt),
  };
}

function summarizeResult(result) {
  const stdout = result.stdout && typeof result.stdout === "object" ? result.stdout : {};
  const planName = stdout.plan_name || null;
  const productName = stdout.product_name || null;
  const roi = stdout.roi?.page_fill_roi == null ? null : stdout.roi.page_fill_roi;
  const childTiming = stdout.timing || null;
  return {
    product_id: result.product_id,
    product_name: productName,
    ok: result.ok,
    status: result.status,
    plan_name: planName,
    roi,
    timing: childTiming || result.timing,
  };
}

function buildFeishuMessage(payload) {
  const total = payload.results.length;
  const success = payload.results.filter((item) => item.ok).length;
  const failed = total - success;
  const mode = payload.dry_run ? "dry-run" : payload.publish ? "发布" : "配置到发布前";
  const lines = [
    `千川批量投流${failed ? "有失败" : "已完成"}`,
    `模式：${mode}`,
    `进度：成功 ${success}/${total}，失败 ${failed}`,
    `累计用时：${payload.batch_timing.elapsed_human}`,
  ];
  for (const item of payload.results.map(summarizeResult)) {
    const name = item.product_name ? `（${item.product_name.slice(0, 24)}）` : "";
    const plan = item.plan_name ? `，计划：${item.plan_name}` : "";
    const roi = item.roi == null ? "" : `，ROI：${item.roi}`;
    lines.push(`- ${item.product_id}${name}：${item.ok ? "成功" : "失败"}，用时 ${item.timing.elapsed_human}${roi}${plan}`);
  }
  if (failed) {
    const firstFailed = payload.results.find((item) => !item.ok);
    const reason = (firstFailed?.stderr || "").trim().split("\n")[0] || `status ${firstFailed?.status}`;
    lines.push(`失败原因：${firstFailed?.product_id} ${reason}`);
  }
  return lines.join("\n");
}

function sendFeishuNotify(payload) {
  if (payload.dry_run || !payload.notify) {
    return { skipped: true, reason: payload.dry_run ? "dry_run" : "disabled" };
  }
  if (!FEISHU_NOTIFY_SCRIPT) {
    return { skipped: true, reason: "FEISHU_NOTIFY_SCRIPT not set" };
  }
  if (!fs.existsSync(FEISHU_NOTIFY_SCRIPT)) {
    return { ok: false, reason: `notify script not found: ${FEISHU_NOTIFY_SCRIPT}` };
  }

  const message = buildFeishuMessage(payload);
  const res = spawnSync("python3", [FEISHU_NOTIFY_SCRIPT, "notify", "--message", message], {
    encoding: "utf8",
  });
  return {
    ok: res.status === 0,
    status: res.status,
    message,
    stdout: res.stdout,
    stderr: res.stderr,
  };
}

async function ensureCreatePage() {
  const targets = await listTargets();
  const existingCreate = targets.find((item) =>
    (item.url || "").includes("qianchuan.jinritemai.com/uni-creation/product"),
  );
  if (existingCreate) return existingCreate.url;

  const qianchuanTarget = targets.find((item) =>
    (item.url || "").includes("qianchuan.jinritemai.com/uni-prom") ||
    (item.url || "").includes("qianchuan.jinritemai.com/home") ||
    (item.url || "").includes("qianchuan.jinritemai.com"),
  );
  if (!qianchuanTarget) {
    throw new Error("未找到千川 CDP tab，无法自动打开商品创建页");
  }

  const currentUrl = new URL(qianchuanTarget.url);
  const aavid = currentUrl.searchParams.get("aavid");
  if (!aavid) {
    throw new Error(`无法从当前千川页面提取 aavid: ${qianchuanTarget.url}`);
  }

  const client = await connectToTarget(qianchuanTarget);
  try {
    await client.send("Page.enable");
    await client.send("Page.navigate", {
      url: `https://qianchuan.jinritemai.com/uni-creation/product?aavid=${aavid}`,
    });
    await sleep(5000);
    await client.send("Page.bringToFront");
    return `https://qianchuan.jinritemai.com/uni-creation/product?aavid=${aavid}`;
  } finally {
    client.close();
  }
}

async function main() {
  const batchStartMs = Date.now();
  const batchStartedAt = nowIso();
  const cfg = parseArgs(process.argv.slice(2));
  const plans = JSON.parse(fs.readFileSync(cfg.input, "utf8"));
  if (!Array.isArray(plans)) throw new Error("plans.json 顶层必须是数组");

  const results = [];
  let notifyResult = null;
  for (const plan of plans) {
    if (!cfg.dry_run) await ensureCreatePage();
    const result = runPlan(plan, cfg.dry_run, cfg.publish);
    results.push(result);
    if (!result.ok) {
      console.error(`商品 ${plan.product_id} 执行失败，已停止后续商品。`);
      break;
    }
    if (!cfg.dry_run && !cfg.publish && result.ok) {
      console.error(`商品 ${plan.product_id} 已按单商品单计划配置到发布前；请先确认并发布当前商品，再继续下一个商品。`);
      break;
    }
  }

  const payload = {
    input: cfg.input,
    dry_run: cfg.dry_run,
    publish: cfg.publish,
    notify: cfg.notify,
    batch_timing: buildTiming(batchStartMs, batchStartedAt),
    results,
  };
  notifyResult = sendFeishuNotify(payload);
  payload.notify_result = notifyResult;
  console.log(JSON.stringify(payload, null, 2));
  if (results.some((item) => !item.ok)) process.exit(2);
}

main().catch((error) => {
  console.error(error.message);
  usage();
  process.exit(1);
});
