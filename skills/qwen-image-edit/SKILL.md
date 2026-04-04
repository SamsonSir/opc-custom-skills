---
name: qwen-image-edit
description: 使用阿里云通义千问 Qwen-Image-2.0-Pro 进行图像编辑。支持多图输入、文本指令编辑、风格迁移、姿势调整等高级图像处理场景。
---

# Qwen Image Edit - 通义千问图像编辑

本 Skill 封装阿里云通义千问（Qwen）的多模态图像编辑能力，支持通过多张图片 + 文本指令进行高级图像编辑。

## 核心能力

- **多图输入**: 支持 1-3 张图片同时输入
- **文本指令**: 通过自然语言描述编辑需求
- **风格迁移**: 将一张图的风格应用到另一张图
- **姿势调整**: 参考姿势图调整目标图
- **服装替换**: 将服装从一张图迁移到另一张图的人物
- **多图生成**: 一次生成多张不同结果

## 使用方法

### 单图编辑

```bash
uv run {baseDir}/scripts/edit_image.py \
  --images "https://example.com/image1.png" \
  --prompt "将背景改为赛博朋克风格"
```

### 多图编辑（风格迁移）

```bash
uv run {baseDir}/scripts/edit_image.py \
  --images "https://example.com/target.png" "https://example.com/style.png" \
  --prompt "将图1的风格改为图2的风格"
```

### 多图编辑（服装替换）

```bash
uv run {baseDir}/scripts/edit_image.py \
  --images "https://example.com/person.png" "https://example.com/dress.png" "https://example.com/pose.png" \
  --prompt "图1中的女生穿着图2中的黑色裙子按图3的姿势坐下"
```

### 高级参数

```bash
# 生成多张结果
uv run {baseDir}/scripts/edit_image.py \
  --images "https://example.com/img.png" \
  --prompt "添加日落背景" \
  --num-results 3

# 自定义尺寸
uv run {baseDir}/scripts/edit_image.py \
  --images "https://example.com/img.png" \
  --prompt "放大到4K" \
  --size "2048*3072"

# 禁用提示词扩展
uv run {baseDir}/scripts/edit_image.py \
  --images "https://example.com/img.png" \
  --prompt "简单背景" \
  --no-prompt-extend

# 添加水印
uv run {baseDir}/scripts/edit_image.py \
  --images "https://example.com/img.png" \
  --prompt "美化" \
  --watermark
```

## 参数说明

| 参数 | 必选 | 默认值 | 说明 |
|------|------|--------|------|
| `--images` | ✅ | - | 图片 URL 列表（1-3张） |
| `--prompt` | ✅ | - | 文本编辑指令 |
| `--num-results` / `-n` | ❌ | 1 | 生成图片数量（1-4） |
| `--size` | ❌ | 1024*1536 | 图片尺寸（宽*高） |
| `--negative-prompt` | ❌ | 空 | 负面提示词（避免生成的内容） |
| `--prompt-extend` / `--no-prompt-extend` | ❌ | 启用 | 是否自动扩展提示词 |
| `--watermark` / `--no-watermark` | ❌ | 无水印 | 是否添加水印 |

## 工作流

1. 调用 `edit_image.py` 脚本
2. 脚本会输出以 `MEDIA_URL: ` 开头的图片链接（多张结果会输出多行）
3. 提取链接并用 Markdown 展示：`![Edited Image 1](URL1)`
4. 无需下载图片（除非用户要求）

## 典型场景示例

### 场景1：服装替换 + 姿势调整
```
图片1: 人物原图
图片2: 服装参考
图片3: 姿势参考
提示词: "图1中的女生穿着图2中的黑色裙子按图3的姿势坐下"
```

### 场景2：风格迁移
```
图片1: 目标图片
图片2: 风格参考
提示词: "将图1的风格改为图2的油画风格"
```

### 场景3：背景替换
```
图片1: 人物照片
提示词: "将背景替换为星空，保持人物不变"
```

### 场景4：多图融合
```
图片1: 场景A
图片2: 场景B
提示词: "将图1和图2融合，创建一个既有城市又有自然的场景"
```

## 注意事项

- 支持 PNG、JPG、WEBP 格式图片
- 图片 URL 必须可公开访问
- 建议图片分辨率不低于 512x512
- 多图输入时，提示词中用"图1"、"图2"、"图3"引用
- API Key 已内置，无需额外配置
- 提示词扩展功能会自动优化用户的简单描述

## 技术规格

- **API 端点**: https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
- **模型**: qwen-image-2.0-pro
- **支持格式**: PNG, JPG, WEBP
- **最大图片数**: 3张
- **生成数量**: 1-4张
