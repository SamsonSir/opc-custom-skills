---
name: video-content-extractor
description: "视频/图片内容提取：视觉理解 + OCR。支持图片(JPG/PNG/WebP)和视频(MP4/MOV/AVI/MKV)，自动关键帧提取，PaddleOCR文字识别，多模态模型理解，结构化输出。"
metadata:
  openclaw:
    requires:
      bins:
        - python
        - ffmpeg
    emoji: "🎬"
    homepage: https://github.com/openclaw/video-content-extractor
---

# Video Content Extractor

## 概述

视频/图片内容提取工具，结合 **视觉理解 + OCR** 实现完整的多模态内容提取。

**核心能力**：
- 图片/视频自动识别与处理
- 智能关键帧提取（定时采样 + 场景变化检测）
- PaddleOCR 精准文字提取（位置 + 置信度）
- 多模态模型深度理解（内容/逻辑/结构）
- 标准化结构化输出（JSON/Markdown）

---

## 流程架构

```
【输入源】
   ├─ 图片：JPG / PNG / WebP
   └─ 视频：MP4 / MOV / AVI / MKV
        ↓
【自动判断 + 预处理模块】
   • 图片 → 规范化后直接进入 OCR
   • 视频 → 智能关键帧提取（定时采样 + 场景变化检测）
        ↓
【PaddleOCR 统一文字提取】
   └─ 输出：文字内容 + 坐标位置 + 置信度 + 分行/阅读顺序
        ↓
【OCR 后处理】
   • 帧内合并碎片、跨帧去重、低置信度标记
        ↓
【多模态数据组装】
   └─ 图像帧 + OCR 结构化文本（含时间戳/场景）
        ↓
【核心大脑：视觉大模型】
   └─ 执行：内容理解 + 信息抽取 + 逻辑总结 + 结构整理
        ↓
【标准化输出】
   └─ JSON / Markdown 结构化结果（附溯源元数据）
```

---

## 使用方式

### 基本用法

```bash
# 处理图片
python scripts/extract.py --input image.jpg --output result.json

# 处理视频
python scripts/extract.py --input video.mp4 --output result.json

# 指定输出格式
python scripts/extract.py --input video.mp4 --format markdown --output result.md

# 完整参数
python scripts/extract.py \
  --input video.mp4 \
  --output result.json \
  --format json \
  --frame-interval 2 \
  --scene-threshold 0.3 \
  --ocr-lang ch \
  --model kimi
```

### 参数说明

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--input` | 输入文件（图片/视频） | 必填 |
| `--output` | 输出文件路径 | 必填 |
| `--format` | 输出格式 (json/markdown) | json |
| `--frame-interval` | 帧提取间隔（秒） | 2 |
| `--scene-threshold` | 场景变化阈值 | 0.3 |
| `--ocr-lang` | OCR 语言 (ch/en) | ch |
| `--model` | 视觉模型 (kimi/claude) | kimi |

---

## 输出结构

### JSON 格式

```json
{
  "metadata": {
    "input_file": "video.mp4",
    "input_type": "video",
    "duration": 120.5,
    "frame_count": 15,
    "process_time": "2026-03-27T12:00:00+08:00"
  },
  "frames": [
    {
      "frame_id": 0,
      "timestamp": 0.0,
      "ocr_results": [
        {
          "text": "识别的文字",
          "confidence": 0.95,
          "bbox": [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
        }
      ],
      "visual_analysis": "视觉模型对画面的理解..."
    }
  ],
  "summary": {
    "content": "整体内容总结...",
    "key_points": ["要点1", "要点2"],
    "entities": ["实体1", "实体2"]
  },
  "ocr_raw": {
    "total_text": "所有识别的文字...",
    "low_confidence": [
      {"frame_id": 0, "text": "低置信度文字", "confidence": 0.65}
    ]
  }
}
```

### Markdown 格式

```markdown
# 视频内容提取报告

## 元信息
- 输入文件: video.mp4
- 时长: 120.5秒
- 提取帧数: 15

## 内容总结
整体内容总结...

## 关键帧分析

### 帧 1 (00:00:00)
**OCR识别文字**:
- 识别的文字 (置信度: 95%)

**视觉分析**:
视觉模型对画面的理解...

## 要点提取
1. 要点1
2. 要点2

## 实体识别
- 实体1
- 实体2
```

---

## 依赖

### 必需
- Python 3.10+
- FFmpeg
- PaddlePaddle 2.6.x
- PaddleOCR 2.7.x

### 可选
- OpenCV (场景变化检测)
- Whisper (音频转文字)

---

## 安装

```bash
# 使用虚拟环境
source /tmp/paddleocr-env/bin/activate

# 安装依赖
pip install opencv-python-headless pillow

# 检查 ffmpeg
ffmpeg -version
```

---

## 注意事项

1. **视频处理**：大视频可能需要较长时间，建议先测试短视频
2. **OCR精度**：低分辨率或模糊图片可能影响识别效果
3. **视觉模型**：需要配置相应的 API 密钥（Kimi/Claude）
4. **内存占用**：处理大视频时注意内存使用

---

## 示例

### 示例1：处理电商产品视频

```bash
python scripts/extract.py \
  --input product_demo.mp4 \
  --output product_info.json \
  --frame-interval 1 \
  --scene-threshold 0.2
```

### 示例2：处理截图

```bash
python scripts/extract.py \
  --input screenshot.png \
  --output screenshot_analysis.md \
  --format markdown
```

### 示例3：批量处理文件夹（新功能）

```bash
# 批量处理文件夹中的所有图片和视频
python scripts/batch_extract.py \
  -i ./images/ \
  -o ./results/ \
  -f json \
  -w 3

# 输出为markdown格式
python scripts/batch_extract.py \
  -i ./product_images/ \
  -o ./extracted_data/ \
  -f markdown \
  -w 5
```

**批量处理特点**：
- ✅ 自动识别图片和视频
- ✅ 多线程并发处理
- ✅ 自动生成批量报告
- ✅ 实时显示进度

---

## 参考文档

- `references/output_schema.md` - 输出格式详细说明
- `references/ocr_config.md` - OCR 配置参数
