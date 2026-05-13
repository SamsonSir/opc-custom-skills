#!/usr/bin/env node

const fs = require("fs");

function usage() {
  console.error(`用法:
  calc_roi.js --sale-price <number> --unit-cost <number> [options]
  calc_roi.js --config <roi-config.json>

选项:
  --sku <name:sale_price:sku_ratio:unit_cost>  可重复传入多 SKU
  --sign-rate <number>       默认 0.8
  --ship-rate <number>       默认 0.9
  --shipping-fee <number>    默认 0
  --commission-rate <number> 默认 0.05
  --profit-rate <number>     默认 0.01

示例:
  node calc_roi.js --sale-price 299 --unit-cost 40 --sign-rate 0.55
  node calc_roi.js --sku A:32:0.7:16 --sku B:39:0.3:19
`);
}

function num(value, name) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} 不是有效数字: ${value}`);
  }
  return parsed;
}

function rate(value, name) {
  const parsed = num(value, name);
  return parsed > 1 ? parsed / 100 : parsed;
}

function parseArgs(argv) {
  const cfg = {
    sign_rate: 0.8,
    ship_rate: 0.9,
    shipping_fee: 0,
    commission_rate: 0.05,
    profit_rate: 0.01,
    sku_items: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      i += 1;
      if (i >= argv.length) throw new Error(`${arg} 缺少值`);
      return argv[i];
    };

    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    } else if (arg === "--config") {
      const loaded = JSON.parse(fs.readFileSync(next(), "utf8"));
      Object.assign(cfg, loaded.defaults || {}, loaded);
    } else if (arg === "--sale-price") {
      cfg.sale_price = num(next(), arg);
    } else if (arg === "--unit-cost") {
      cfg.unit_cost = num(next(), arg);
    } else if (arg === "--sku") {
      const [sku_name, salePrice, skuRatio, unitCost] = next().split(":");
      cfg.sku_items.push({
        sku_name: sku_name || "SKU",
        sale_price: num(salePrice, "sku.sale_price"),
        sku_ratio: num(skuRatio, "sku.sku_ratio"),
        unit_cost: num(unitCost, "sku.unit_cost"),
      });
    } else if (arg === "--sign-rate") {
      cfg.sign_rate = rate(next(), arg);
    } else if (arg === "--ship-rate") {
      cfg.ship_rate = rate(next(), arg);
    } else if (arg === "--shipping-fee") {
      cfg.shipping_fee = num(next(), arg);
    } else if (arg === "--commission-rate") {
      cfg.commission_rate = rate(next(), arg);
    } else if (arg === "--profit-rate") {
      cfg.profit_rate = rate(next(), arg);
    } else {
      throw new Error(`未知参数: ${arg}`);
    }
  }

  if (cfg.sku_items.length === 0) {
    if (cfg.sale_price == null || cfg.unit_cost == null) {
      throw new Error("缺少 --sale-price/--unit-cost，或至少一个 --sku");
    }
    cfg.sku_items.push({
      sku_name: "默认SKU",
      sale_price: cfg.sale_price,
      sku_ratio: 1,
      unit_cost: cfg.unit_cost,
    });
  }

  return cfg;
}

function round(value, scale) {
  const factor = 10 ** scale;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function calculate(cfg) {
  const ratioSum = cfg.sku_items.reduce((sum, sku) => sum + sku.sku_ratio, 0);
  if (Math.abs(ratioSum - 1) > 0.0001) {
    throw new Error(`SKU 占比之和必须为 1，当前为 ${ratioSum}`);
  }

  const avgOrderValue = cfg.sku_items.reduce(
    (sum, sku) => sum + sku.sale_price * sku.sku_ratio,
    0,
  );
  const weightedUnitCost = cfg.sku_items.reduce(
    (sum, sku) => sum + sku.unit_cost * sku.sku_ratio,
    0,
  );
  const signedRevenue = avgOrderValue * cfg.sign_rate * cfg.ship_rate;
  const allowableAdCost =
    signedRevenue -
    cfg.shipping_fee * cfg.ship_rate -
    signedRevenue * cfg.commission_rate -
    avgOrderValue * cfg.profit_rate -
    weightedUnitCost * cfg.sign_rate * cfg.ship_rate;

  if (allowableAdCost <= 0) {
    return {
      ok: false,
      reason: "当前利润模型下可承受广告成本 <= 0，不建议继续投放",
      avg_order_value: round(avgOrderValue, 4),
      weighted_unit_cost: round(weightedUnitCost, 4),
      allowable_ad_cost: round(allowableAdCost, 4),
    };
  }

  const targetRoi = avgOrderValue / allowableAdCost;
  return {
    ok: true,
    avg_order_value: round(avgOrderValue, 4),
    weighted_unit_cost: round(weightedUnitCost, 4),
    allowable_ad_cost: round(allowableAdCost, 4),
    target_roi: round(targetRoi, 4),
    page_fill_roi: round(targetRoi, 2),
  };
}

try {
  const cfg = parseArgs(process.argv.slice(2));
  const result = calculate(cfg);
  console.log(JSON.stringify({ input: cfg, result }, null, 2));
  if (!result.ok) process.exit(2);
} catch (error) {
  console.error(error.message);
  usage();
  process.exit(1);
}
