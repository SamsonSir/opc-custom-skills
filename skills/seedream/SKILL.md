---
name: seedream
description: 使用火山引擎 Seedream-5.0 API 生成高质量图片。支持主题模板、批量生成、并发请求。适用于文生图场景，支持中英文提示词，可生成 2K/4K 高清图像。
---

# Seedream - 火山引擎 AI 图片生成 v2.0

本 Skill 封装火山引擎（Volcengine）的 Seedream-5.0 图片生成能力，支持通过文本提示词生成高质量 AI 图像。

## 🆕 v2.0 新特性

- **🎨 主题模板**：8种预设主题风格（小红书封面、海报、头像等）
- **📦 批量生成**：从文件读取多个提示词，一键批量生成
- **⚡ 并发请求**：多线程并发，大幅提升批量生成效率
- **🎯 多结果**：单次请求可生成 1-4 张不同图片
- **🛡️ 自动重试**：失败自动重试，提高成功率

---

## 使用方法

### 1️⃣ 单张生成（基础）

```bash
uv run {baseDir}/scripts/generate_image_v2.py --prompt "你的提示词"
```

### 2️⃣ 使用主题模板

```bash
# 小红书封面风格
uv run {baseDir}/scripts/generate_image_v2.py \
  --prompt "月入3W的秘密" \
  --theme xiaohongshu_cover

# 小红书科技风格
uv run {baseDir}/scripts/generate_image_v2.py \
  --prompt "AI工具推荐" \
  --theme xiaohongshu_tech
```

**可用主题**：

| 主题 | 用途 | 默认尺寸 |
|------|------|----------|
| `xiaohongshu_cover` | 小红书大字报封面 | 1920x2560 |
| `xiaohongshu_tech` | 小红书科技内容 | 1920x2560 |
| `xiaohongshu_education` | 小红书教育/教程 | 1920x2560 |
| `poster` | 海报设计 | 2k |
| `avatar` | 头像设计 | 1920x1920 |
| `banner` | 横幅Banner | 1920x1080 |
| `illustration` | 插画风格 | 2k |
| `product` | 产品摄影 | 2k |

查看所有主题：
```bash
uv run {baseDir}/scripts/generate_image_v2.py --list-themes
```

### 3️⃣ 批量生成（并发）

创建提示词文件 `prompts.txt`（每行一个）：
```
AI爆款赚钱笔记封面
2026学习路线图
10个必试AI工具
OpenClaw企业级实战
微信ClawBot教程
```

批量生成（3并发）：
```bash
uv run {baseDir}/scripts/generate_image_v2.py \
  --batch prompts.txt \
  --theme xiaohongshu_cover \
  --workers 3 \
  --no-watermark
```

### 4️⃣ 一次生成多张

```bash
# 一次生成4张不同结果
uv run {baseDir}/scripts/generate_image_v2.py \
  --prompt "赛博朋克城市" \
  --num-results 4
```

### 5️⃣ 高级参数

```bash
uv run {baseDir}/scripts/generate_image_v2.py \
  --prompt "精美插画" \
  --size "4K" \
  --no-watermark \
  --negative-prompt "模糊,低质量,变形" \
  --output-json
```

---

## 参数说明

| 参数 | 必选 | 默认值 | 说明 |
|------|------|--------|------|
| `--prompt` | 单张时✅ | - | 图像生成的文本描述 |
| `--theme` | ❌ | - | 主题模板（查看：`--list-themes`） |
| `--size` | ❌ | `2K` | 图像尺寸：`2K`、`4K` 或具体像素 |
| `--batch` | ❌ | - | 批量模式：提示词文件路径 |
| `--workers` | ❌ | `3` | 并发线程数（批量模式） |
| `--num-results` / `-n` | ❌ | `1` | 单次生成数量（1-4） |
| `--negative-prompt` | ❌ | - | 负面提示词（避免的内容） |
| `--watermark` | ❌ | 启用 | 添加水印 |
| `--no-watermark` | ❌ | - | 不添加水印 |
| `--output-json` | ❌ | - | JSON格式输出结果 |
| `--list-themes` | ❌ | - | 列出所有主题模板 |

---

## 工作流示例

### 场景1：小红书内容矩阵封面生成

```bash
# 1. 准备提示词文件
cat > covers.txt << EOF
AI赚钱秘籍：月入3W的方法
2026最全AI学习路线
10个必试AI工具推荐
OpenClaw+n8n企业实战
微信秒变AI控制台
EOF

# 2. 批量生成（5并发，小红书封面风格）
uv run {baseDir}/scripts/generate_image_v2.py \
  --batch covers.txt \
  --theme xiaohongshu_cover \
  --workers 5 \
  --no-watermark

# 3. 输出结果
# MEDIA_URL_001: https://...
# MEDIA_URL_002: https://...
# ...
```

### 场景2：产品图批量生成

```bash
# 创建产品描述文件
cat > products.txt << EOF
白色无线耳机，极简设计
黑色机械键盘，RGB背光
银色充电宝，金属质感
EOF

# 批量生成产品图
uv run {baseDir}/scripts/generate_image_v2.py \
  --batch products.txt \
  --theme product \
  --workers 3 \
  --size "2048x2048" \
  --no-watermark
```

### 场景3：A/B测试封面（多结果模式）

```bash
# 一次生成4个版本，选最好的一张
uv run {baseDir}/scripts/generate_image_v2.py \
  --prompt "爆款标题设计，AI赚钱主题" \
  --theme xiaohongshu_cover \
  --num-results 4 \
  --no-watermark
```

---

## 批量文件格式

### 格式1：每行一个提示词（推荐）
```
AI赚钱秘籍封面
学习路线图设计
10个工具推荐
```

### 格式2：JSON数组
```json
[
  "AI赚钱秘籍封面",
  "学习路线图设计",
  "10个工具推荐"
]
```

---

## 注意事项

- Seedream-5.0 支持中英文提示词
- API Key 已内置，无需额外配置
- 生成的图片默认带水印（可通过 `--no-watermark` 关闭）
- 批量模式建议 `--workers` 不超过 5，避免触发限流
- 主题模板会自动在提示词前后添加风格描述
- 失败的任务会自动重试 3 次

---

## 技术规格

- **API 端点**: https://ark.cn-beijing.volces.com/api/v3/images/generations
- **模型**: doubao-seedream-5-0-260128
- **响应格式**: URL（图片链接）
- **单次最大生成数**: 4张
- **批量并发限制**: 建议最多5并发

---

## 迁移指南（v1 → v2）

v1 脚本仍然可用，v2 新增功能：

| v1 用法 | v2 等效用法 |
|---------|-------------|
| `generate_image.py --prompt "xxx"` | `generate_image_v2.py --prompt "xxx"` ✅兼容 |
| - | `generate_image_v2.py --theme xiaohongshu_cover` 🆕新增 |
| - | `generate_image_v2.py --batch prompts.txt` 🆕新增 |
| - | `generate_image_v2.py --num-results 4` 🆕新增 |
