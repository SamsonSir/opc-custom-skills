#!/usr/bin/env node

function usage() {
  console.error(`用法:
  generate_title.js --product-name <商品名> [--json]

示例:
  node generate_title.js --product-name "醋酸半身裙女款独特设计感漂亮套装缎面鱼尾裙高级感chic别致穿搭"
`);
}

function parseArgs(argv) {
  const cfg = { json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      i += 1;
      if (i >= argv.length) throw new Error(`${arg} 缺少值`);
      return argv[i];
    };

    if (arg === "--product-name") {
      cfg.product_name = next();
    } else if (arg === "--json") {
      cfg.json = true;
    } else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    } else {
      throw new Error(`未知参数: ${arg}`);
    }
  }

  if (!cfg.product_name) throw new Error("缺少 --product-name");
  return cfg;
}

function cleanName(name) {
  return name
    .replace(/\s+/g, "")
    .replace(/[【】\[\]（）()]/g, "")
    .replace(/女款|女士|漂亮|套装|chic|别致|独特设计感|设计感|高级感高级感/gi, "")
    .trim();
}

function pickKeywords(name) {
  const dict = [
    "醋酸",
    "缎面",
    "鱼尾",
    "半身裙",
    "连衣裙",
    "套装",
    "显瘦",
    "高级感",
    "通勤",
    "约会",
    "百搭",
    "春夏",
    "秋冬",
    "小个子",
    "遮胯",
    "垂感",
    "内衣",
    "文胸",
    "美背",
    "无痕",
    "大U",
    "承托",
    "舒适",
    "柔软",
    "不勒",
  ];
  return dict.filter((word) => name.includes(word));
}

function limitTitle(title, max = 55) {
  return title.length <= max ? title : title.slice(0, max);
}

function generateTitles(productName) {
  const cleaned = cleanName(productName);
  const keywords = pickKeywords(productName);
  const has = (word) => keywords.includes(word) || productName.includes(word);

  if (has("内衣") || has("文胸") || has("美背")) {
    const category = has("文胸") ? "文胸" : "内衣";
    const shape = has("大U") ? "大U美背" : has("美背") ? "美背" : "";
    const trace = has("无痕") ? "无痕" : "";
    const comfort = has("舒适") || has("柔软") ? "舒适柔软" : "舒适";
    const support = has("承托") ? "承托稳定" : "贴身承托";
    const candidates = [
      `${trace}${shape}${category} ${comfort}${support}`,
      `${shape || trace}${category} 日常舒适不勒身`,
      `${trace}${category} 柔软承托美背款`,
      cleaned,
    ]
      .map((title) => title.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .map((title) => limitTitle(title));

    return [...new Set(candidates)];
  }

  const category = has("半身裙")
    ? "半身裙"
    : has("连衣裙")
      ? "连衣裙"
      : cleaned.slice(0, 8);

  const material = [has("醋酸") ? "醋酸" : "", has("缎面") ? "缎面" : ""]
    .filter(Boolean)
    .join("");
  const shape = has("鱼尾") ? "鱼尾" : "";
  const style = has("高级感") ? "高级感" : "质感";
  const fit = has("显瘦") ? "显瘦" : "显瘦";

  const candidates = [
    `${material}${shape}${category} ${style}${fit}穿搭`,
    `${style}${material}${category} ${shape}${fit}百搭`,
    `${material}${category} 通勤约会都好搭`,
    cleaned,
  ]
    .map((title) => title.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((title) => limitTitle(title));

  return [...new Set(candidates)];
}

if (require.main === module) {
  try {
    const cfg = parseArgs(process.argv.slice(2));
    const titles = generateTitles(cfg.product_name);
    const payload = { product_name: cfg.product_name, titles, title: titles[0] };
    if (cfg.json) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.log(payload.title);
    }
  } catch (error) {
    console.error(error.message);
    usage();
    process.exit(1);
  }
}

module.exports = { generateTitles };
