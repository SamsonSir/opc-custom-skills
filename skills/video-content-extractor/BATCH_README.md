# 批量处理功能说明

## 新增脚本

**`scripts/batch_extract.py`** - 批量处理文件夹中的图片和视频

## 功能特点

- 🖼️ 自动识别图片格式：JPG, PNG, WebP, BMP, GIF, TIFF
- 🎬 自动识别视频格式：MP4, MOV, AVI, MKV, FLV, WMV, WebM
- ⚡ 多线程并发处理，提高效率
- 📊 自动生成批量处理报告
- 📁 支持混合处理（图片+视频一起）

## 使用方法

```bash
# 基础用法
python scripts/batch_extract.py -i <输入文件夹> -o <输出文件夹>

# 完整参数
python scripts/batch_extract.py \
  -i ./images/ \           # 输入文件夹
  -o ./results/ \          # 输出文件夹
  -f json \                # 格式: json 或 markdown
  -w 3 \                   # 并发数
  --ocr-lang ch            # OCR语言: ch 或 en
```

## 输出结构

```
results/
├── image1.json            # 单个文件结果
├── image2.json
├── video1.json
└── batch_report_20260402_161500.json  # 批量处理报告
```

## 报告内容

- 总文件数
- 成功/失败数量
- 成功率
- 图片/视频统计
- 失败文件列表
