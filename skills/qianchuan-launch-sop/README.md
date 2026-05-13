# qianchuan-launch-sop

巨量千川商品全域投放 SOP。用于在已登录的 Chrome CDP 会话中创建商品全域投放计划，覆盖 ROI 计算、预算填写、本地视频上传、标题生成和批量串行发布。

## 前置条件

- Node.js 支持全局 `fetch` 与 `WebSocket`
- Chrome 以 CDP 方式启动，默认端口 `9222`
- 浏览器已登录 `qianchuan.jinritemai.com`
- 本地素材目录包含 `.mp4` 视频

可通过环境变量切换 CDP 端口：

```bash
QIANCHUAN_CDP_PORT=9222
```

## 单商品 dry-run

```bash
node ./scripts/create_qianchuan_plan.js \
  --product-id 1234567890123456789 \
  --sale-price 299 \
  --unit-cost 40 \
  --sign-rate 0.55 \
  --product-name "示例商品名称" \
  --material-dir "/path/to/clip_outputs/示例商品名称" \
  --dry-run
```

## 批量 dry-run

```bash
node ./scripts/batch_create_qianchuan_plans.js \
  --input ./references/batch-launch.example.json \
  --dry-run
```

## 可选通知

批量真实执行时可通过 `FEISHU_NOTIFY_SCRIPT` 接入外部通知脚本。未设置该环境变量时，通知会被跳过，不影响投流主流程。

```bash
FEISHU_NOTIFY_SCRIPT=/path/to/notify.py
```

## 安全边界

本技能不包含真实商品参数、账号 Cookie、浏览器登录态或素材文件。真实投放前必须确认商品、预算、ROI 和素材合规性。
