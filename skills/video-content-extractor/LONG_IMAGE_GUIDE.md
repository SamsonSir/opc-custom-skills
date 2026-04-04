

---

## 新增功能：自动切分长图

### 功能说明

当检测到图片高度超过 **3000px** 时，技能会**自动切分**图片为多张，分别识别后合并结果。

**适用场景**：
- 📱 手机长截图
- 📄 长文档/技能文档图片  
- 🖼️ 超长电商详情页

**自动切分参数**：
- 单张最大高度：`2500px`
- 切分重叠区域：`100px`（避免文字被截断）

### 使用方式

**方式1：主脚本自动检测（推荐）**
```bash
# 高度超过3000px的图片会自动切分
python scripts/extract.py \
  -i long_skill_document.jpg \
  -o extracted_content.json
```

输出示例：
```
[INFO] Detected long image: 1592x13433px, auto-slicing...
[INFO] Slicing into 6 parts (height=2500, overlap=100)
[INFO] Processing slice 1/6: Y=0-2500
[INFO] Processing slice 2/6: Y=2400-4900
...
[OK] Merged 6 slices
```

**方式2：专用长图处理脚本（更多控制）**
```bash
python scripts/extract_long_image.py \
  -i long_document.png \
  -o result.json \
  --max-height 2000 \
  --overlap 150
```

### 输出结构（长图模式）

```json
{
  "metadata": {
    "input_file": "long_doc.jpg",
    "input_type": "image",
    "process_method": "auto_sliced",
    "slice_count": 6
  },
  "frames": [{
    "ocr_raw_text": "合并后的完整文字...",
    "ocr_results": [...],
    "slices_analysis": [
      {"slice": 1, "y_range": [0, 2500], "analysis": "..."},
      {"slice": 2, "y_range": [2400, 4900], "analysis": "..."}
    ]
  }]
}
```

### 实际应用案例

**提取超长技能文档**（13433px）：
```bash
# 切分6张，分别识别，合并结果
python scripts/extract.py \
  -i douyin_skill_doc.jpg \
  -o skill_content.json

# 结果包含完整文档文字和每个切片的分析
```
