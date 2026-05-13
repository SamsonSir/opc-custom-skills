#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { generateTitles } = require("./generate_title");

function usage() {
  console.error(`用法:
  build_launch_inputs.js --clip-root <clip_outputs目录> --params <params.json> [--output <plans.json>]

params.json 格式:
[
  {
    "product_id": "1234567890123456789",
    "product_name": "示例商品名称",
    "sale_price": 299,
    "unit_cost": 40,
    "sign_rate": 0.55
  }
]

说明:
  - 自动从 clip-root 下匹配包含商品名的素材目录
  - 自动生成标题
  - 输出 batch_create_qianchuan_plans.js 可直接读取的 JSON
`);
}

function parseArgs(argv) {
  const cfg = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      i += 1;
      if (i >= argv.length) throw new Error(`${arg} 缺少值`);
      return argv[i];
    };

    if (arg === "--clip-root") cfg.clip_root = next();
    else if (arg === "--params") cfg.params = next();
    else if (arg === "--output") cfg.output = next();
    else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    } else throw new Error(`未知参数: ${arg}`);
  }
  if (!cfg.clip_root) throw new Error("缺少 --clip-root");
  if (!cfg.params) throw new Error("缺少 --params");
  cfg.clip_root = path.resolve(cfg.clip_root);
  cfg.params = path.resolve(cfg.params);
  if (cfg.output) cfg.output = path.resolve(cfg.output);
  return cfg;
}

function normalize(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function listDirs(root) {
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map((item) => path.join(root, item.name));
}

function findMaterialDir(clipRoot, productName) {
  const target = normalize(productName);
  const dirs = listDirs(clipRoot);

  const exact = dirs.find((dir) => normalize(path.basename(dir)).includes(target));
  if (exact) return exact;

  const shortTarget = target.slice(0, Math.min(target.length, 18));
  const partial = dirs.find((dir) => normalize(path.basename(dir)).includes(shortTarget));
  if (partial) return partial;

  return null;
}

try {
  const cfg = parseArgs(process.argv.slice(2));
  const params = JSON.parse(fs.readFileSync(cfg.params, "utf8"));
  if (!Array.isArray(params)) throw new Error("params.json 顶层必须是数组");

  const plans = params.map((item) => {
    const materialDir = item.material_dir || findMaterialDir(cfg.clip_root, item.product_name);
    if (!materialDir) {
      throw new Error(`未找到素材目录: ${item.product_name}`);
    }
    return {
      product_id: String(item.product_id),
      product_name: item.product_name,
      sale_price: item.sale_price,
      unit_cost: item.unit_cost,
      sign_rate: item.sign_rate,
      material_dir: materialDir,
      title: item.title || generateTitles(item.product_name)[0],
      daily_budget: item.daily_budget || 300,
    };
  });

  const output = JSON.stringify(plans, null, 2);
  if (cfg.output) {
    fs.writeFileSync(cfg.output, `${output}\n`);
    console.log(cfg.output);
  } else {
    console.log(output);
  }
} catch (error) {
  console.error(error.message);
  usage();
  process.exit(1);
}
