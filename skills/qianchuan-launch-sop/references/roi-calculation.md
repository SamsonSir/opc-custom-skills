---
title: 巨量千川 ROI 计算口径
updated: 2026-04-16
source: internal pricing spreadsheet
---

# 巨量千川 ROI 计算口径

这份口径用于给 `qianchuan-launch-sop` 提供统一的 `目标 ROI` 推导方式。

## 一句话定义

`目标ROI = 客单价 / 可承受广告成本`

这里的“可承受广告成本”不是已经花掉的广告费，而是在当前签收率、成本、佣金和目标利润约束下，单均最多还能吃掉多少广告费。

## 字段定义

- `sign_rate`：签收率
- `ship_rate`：发货率
- `shipping_fee`：运费
- `commission_rate`：佣金率，默认 `0.05`
- `profit_rate`：目标利润率
- `sku_items[].sale_price`：SKU 售价
- `sku_items[].sku_ratio`：SKU 占比
- `sku_items[].unit_cost`：SKU 单件成本

## 核心公式

### 1. 客单价

`avg_order_value = Σ(sale_price × sku_ratio)`

### 2. 加权成本

`weighted_unit_cost = Σ(unit_cost × sku_ratio)`

### 3. 可承受广告成本

`allowable_ad_cost = avg_order_value × sign_rate × ship_rate`
`- shipping_fee × ship_rate`
`- avg_order_value × sign_rate × ship_rate × commission_rate`
`- avg_order_value × profit_rate`
`- weighted_unit_cost × sign_rate × ship_rate`

### 4. 目标 ROI

`target_roi = avg_order_value / allowable_ad_cost`

## 等价展开

把上面几步合并后：

`target_roi = avg_order_value / (avg_order_value × sign_rate × ship_rate - shipping_fee × ship_rate - avg_order_value × sign_rate × ship_rate × commission_rate - avg_order_value × profit_rate - weighted_unit_cost × sign_rate × ship_rate)`

## Excel 对应列

- `I`：客单价
- `J`：可承受广告成本
- `L`：ROI

也就是：

- `I = Σ(售价 × SKU比例)`
- `J = 签收后销售额 - 运费 - 佣金 - 目标利润 - 签收后货品成本`
- `L = I / J`

## 示例

固定测算口径：

- `ship_rate = 0.9`
- `profit_rate = 0.01`

除非用户明确要求改口径，千川投流默认使用以上两项固定值。

示例参数：

- `sign_rate = 0.8`
- `ship_rate = 0.9`
- `shipping_fee = 0`
- `commission_rate = 0.05`
- `profit_rate = 0.01`
- 单 SKU：`sale_price = 32`、`sku_ratio = 1`、`unit_cost = 16`

计算结果：

- `avg_order_value = 32`
- `weighted_unit_cost = 16`
- `allowable_ad_cost = 14.72`
- `target_roi = 32 / 14.72 = 2.1739`

## 给 skill 的执行规则

1. 用户明确给 ROI：直接使用用户值。
2. 用户没给 ROI，但给了成本和利润参数：按本口径现算。
3. 用户只给了部分参数：优先补齐 `sign_rate`、`unit_cost`、`sale_price`；发货率固定 90%，利润率固定 1%。
4. 如果算出的 `allowable_ad_cost <= 0`：
   - 不要继续正常投放。
   - 直接提示“当前利润模型下不可投”。
5. 页面填写前，将 ROI 保留 2 位小数；内部计算保留 4 位小数。
