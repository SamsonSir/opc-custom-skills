# Output Schema

## 完整输出结构

```json
{
  "metadata": {
    "input_file": "string - 输入文件名",
    "input_type": "string - image/video",
    "duration": "number - 视频时长（秒）",
    "frame_count": "number - 提取的帧数",
    "process_time": "string - ISO 8601 格式的处理时间"
  },
  "frames": [
    {
      "frame_id": "number - 帧序号",
      "timestamp": "number - 时间戳（秒）",
      "is_scene_change": "boolean - 是否为场景变化帧",
      "ocr_results": [
        {
          "text": "string - 识别的文字",
          "confidence": "number - 置信度 0-1",
          "bbox": "array - 四个角坐标 [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]"
        }
      ],
      "ocr_raw_text": "string - 该帧所有OCR文字的合并",
      "visual_analysis": "string - 视觉模型的分析结果"
    }
  ],
  "summary": {
    "content": "string - 整体内容总结",
    "key_points": ["string - 关键要点1", "string - 关键要点2"],
    "entities": ["string - 识别的实体1", "string - 识别的实体2"]
  },
  "ocr_raw": {
    "total_text": "string - 所有帧的OCR文字合并",
    "unique_count": "number - 去重后的唯一文字数",
    "low_confidence": [
      {
        "frame_id": "number - 帧序号",
        "text": "string - 低置信度文字",
        "confidence": "number - 置信度"
      }
    ]
  }
}
```

---

## 字段说明

### metadata

| 字段 | 类型 | 说明 |
|------|------|------|
| input_file | string | 输入文件名（不含路径） |
| input_type | string | image 或 video |
| duration | number | 视频时长，图片为 0 |
| frame_count | number | 提取/处理的帧数 |
| process_time | string | 处理开始时间，ISO 8601 格式 |

### frames[]

| 字段 | 类型 | 说明 |
|------|------|------|
| frame_id | number | 帧序号，从 0 开始 |
| timestamp | number | 时间戳（秒），图片为 0 |
| is_scene_change | boolean | 是否为检测到的场景变化帧 |
| ocr_results | array | OCR 识别结果列表 |
| ocr_raw_text | string | 该帧所有 OCR 文字的合并 |
| visual_analysis | string | 视觉模型的分析结果（需启用视觉模型） |

### ocr_results[]

| 字段 | 类型 | 说明 |
|------|------|------|
| text | string | 识别的文字内容 |
| confidence | number | 置信度，范围 0-1 |
| bbox | array | 文字区域坐标，四个点的 (x, y) |

### summary

| 字段 | 类型 | 说明 |
|------|------|------|
| content | string | 整体内容总结（需视觉模型） |
| key_points | array | 提取的关键要点列表 |
| entities | array | 识别的实体列表（人名、地名、机构等） |

### ocr_raw

| 字段 | 类型 | 说明 |
|------|------|------|
| total_text | string | 所有帧 OCR 文字的合并 |
| unique_count | number | 去重后的唯一文字条数 |
| low_confidence | array | 低置信度（<0.8）的文字列表 |

---

## bbox 坐标格式

```json
"bbox": [
  [x1, y1],  // 左上角
  [x2, y2],  // 右上角
  [x3, y3],  // 右下角
  [x4, y4]   // 左下角
]
```

坐标原点为图片左上角，x 向右增加，y 向下增加。

---

## 使用示例

### 提取所有文字

```python
import json

with open('result.json') as f:
    data = json.load(f)

# 获取所有 OCR 文字
all_text = data['ocr_raw']['total_text']
print(all_text)

# 按帧获取文字
for frame in data['frames']:
    print(f"Frame {frame['frame_id']}: {frame['ocr_raw_text']}")
```

### 筛选高置信度文字

```python
high_conf_texts = []
for frame in data['frames']:
    for ocr in frame['ocr_results']:
        if ocr['confidence'] > 0.9:
            high_conf_texts.append(ocr['text'])
```

### 获取场景变化帧

```python
scene_frames = [
    frame for frame in data['frames']
    if frame.get('is_scene_change')
]
```
