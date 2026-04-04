#!/usr/bin/env python3
"""
Video Content Extractor - 主入口脚本

功能:
1. 自动识别输入类型（图片/视频）
2. 视频智能关键帧提取
3. PaddleOCR 文字提取
4. 多模态模型理解
5. 结构化输出
"""

import argparse
import json
import os
import sys
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any

# 添加虚拟环境路径
VENV_PATH = "/tmp/paddleocr-env"
if os.path.exists(VENV_PATH):
    sys.path.insert(0, f"{VENV_PATH}/lib/python3.12/site-packages")

# 导入视觉分析模块
try:
    from visual_analyzer import analyze_image
    HAS_VISUAL = True
except ImportError:
    HAS_VISUAL = False
    print("[WARNING] Visual analyzer not available")

# 字幕轨提取函数
def extract_subtitles(video_path: str) -> str:
    """从视频提取内嵌字幕（如果有）"""
    try:
        result = subprocess.run(
            ['ffprobe', '-v', 'error', '-show_streams', '-select_streams', 's', 
             '-of', 'json', video_path],
            capture_output=True, text=True, timeout=10
        )
        data = json.loads(result.stdout)
        streams = data.get('streams', [])
        if streams:
            print(f"[INFO] Found {len(streams)} subtitle track(s)")
            # TODO: 提取字幕内容
            return "[字幕轨存在，待提取]"
        return ""
    except:
        return ""

# 尝试导入依赖
try:
    import cv2
    import numpy as np
    from PIL import Image
    HAS_CV = True
except ImportError:
    HAS_CV = False
    print("[WARNING] OpenCV not available, scene detection disabled")


def get_file_type(file_path: str) -> str:
    """判断文件类型"""
    ext = Path(file_path).suffix.lower()
    image_exts = {'.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif'}
    video_exts = {'.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv'}
    
    if ext in image_exts:
        return 'image'
    elif ext in video_exts:
        return 'video'
    else:
        # 尝试通过 ffprobe 判断
        try:
            result = subprocess.run(
                ['ffprobe', '-v', 'error', '-show_entries', 'format=format_name', '-of', 'default=noprint_wraper=1', file_path],
                capture_output=True, text=True, timeout=5
            )
            if 'Video' in result.stdout or 'Audio' in result.stdout:
                return 'video'
        except:
            pass
        return 'unknown'


def extract_key_frames(video_path: str, output_dir: str, interval: float = 2.0, scene_threshold: float = 0.3) -> List[Dict]:
    """
    从视频中提取关键帧
    
    Args:
        video_path: 视频文件路径
        output_dir: 输出目录
        interval: 定时采样间隔（秒）
        scene_threshold: 场景变化阈值
    
    Returns:
        帧信息列表 [{"path": "...", "timestamp": 0.0, "is_scene_change": False}]
    """
    frames = []
    
    # 获取视频信息
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"[ERROR] Cannot open video: {video_path}")
        return frames
    
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps if fps > 0 else 0
    
    print(f"[INFO] Video: {duration:.1f}s, {fps:.1f} fps, {total_frames} frames")
    
    # 定时采样帧
    interval_frames = int(fps * interval)
    frame_idx = 0
    
    # 场景变化检测
    prev_frame = None
    scene_frames = []
    
    os.makedirs(output_dir, exist_ok=True)
    
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        
        # 转灰度用于场景检测
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        
        # 定时采样
        if frame_idx % interval_frames == 0:
            frame_path = os.path.join(output_dir, f"frame_{frame_idx:06d}.jpg")
            cv2.imwrite(frame_path, frame)
            timestamp = frame_idx / fps
            frames.append({
                "path": frame_path,
                "timestamp": timestamp,
                "is_scene_change": False,
                "frame_idx": frame_idx
            })
        
        # 场景变化检测
        if prev_frame is not None and scene_threshold > 0:
            diff = cv2.absdiff(gray, prev_frame)
            diff_score = np.mean(diff) / 255.0
            if diff_score > scene_threshold:
                frame_path = os.path.join(output_dir, f"scene_{frame_idx:06d}.jpg")
                cv2.imwrite(frame_path, frame)
                timestamp = frame_idx / fps
                frames.append({
                    "path": frame_path,
                    "timestamp": timestamp,
                    "is_scene_change": True,
                    "frame_idx": frame_idx
                })
        
        prev_frame = gray
        frame_idx += 1
    
    cap.release()
    
    print(f"[INFO] Extracted {len(frames)} frames")
    return frames


def extract_frames_ffmpeg(video_path: str, output_dir: str, interval: float = 2.0) -> List[Dict]:
    """
    使用 FFmpeg 提取关键帧（当 OpenCV 不可用时的备用方案）
    """
    frames = []
    os.makedirs(output_dir, exist_ok=True)
    
    # 获取视频时长
    result = subprocess.run(
        ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wraper=1', video_path],
        capture_output=True, text=True
    )
    
    try:
        duration = float(result.stdout.strip())
    except:
        duration = 0
    
    print(f"[INFO] Video duration: {duration:.1f}s")
    
    # 使用 ffmpeg 提取帧
    output_pattern = os.path.join(output_dir, "frame_%04d.jpg")
    subprocess.run([
        'ffmpeg', '-i', video_path,
        '-vf', f'fps=1/{interval}',
        '-q', output_pattern
    ], capture_output=True)
    
    # 收集生成的帧
    for f in sorted(Path(output_dir).glob("frame_*.jpg")):
        frame_num = int(f.stem.split('_')[1])
        timestamp = frame_num * interval
        frames.append({
            "path": str(f),
            "timestamp": timestamp,
            "is_scene_change": False,
            "frame_idx": frame_num
        })
    
    print(f"[INFO] Extracted {len(frames)} frames with FFmpeg")
    return frames


def run_ocr(image_path: str, lang: str = 'ch') -> Dict:
    """
    使用 PaddleOCR 提取文字
    
    Args:
        image_path: 图片路径
        lang: 语言 (ch/en)
    
    Returns:
        {
            "success": True,
            "results": [{"text": "...", "confidence": 0.95, "bbox": [...]}],
            "raw_text": "所有文字..."
        }
    """
    try:
        from paddleocr import PaddleOCR
        
        # 初始化 OCR（使用已有的实例或创建新的）
        ocr = PaddleOCR(lang=lang, use_angle_cls=True, show_log=False)
        
        # 执行 OCR
        result = ocr.ocr(image_path, cls=True)
        
        # 解析结果
        ocr_results = []
        raw_texts = []
        
        if result and result[0]:
            for line in result[0]:
                if line:
                    box = line[0]  # 坐标
                    text = line[1][0]  # 文字
                    confidence = line[1][1]  # 置信度
                    
                    ocr_results.append({
                        "text": text,
                        "confidence": float(confidence),
                        "bbox": box
                    })
                    raw_texts.append(text)
        
        return {
            "success": True,
            "results": ocr_results,
            "raw_text": "\n".join(raw_texts)
        }
    
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "results": [],
            "raw_text": ""
        }


def postprocess_ocr(all_ocr_results: List[Dict]) -> Dict:
    """
    OCR 后处理
    
    功能:
    - 帧内合并碎片文字
    - 跨帧去重
    - 低置信度标记
    """
    # 收集所有文字
    all_texts = []
    low_confidence = []
    seen_texts = set()
    
    for frame_result in all_ocr_results:
        frame_id = frame_result.get("frame_id", 0)
        ocr_data = frame_result.get("ocr", {})
        
        for item in ocr_data.get("results", []):
            text = item.get("text", "")
            conf = item.get("confidence", 0)
            
            # 低置信度标记
            if conf < 0.8:
                low_confidence.append({
                    "frame_id": frame_id,
                    "text": text,
                    "confidence": conf
                })
            
            # 去重
            text_key = text.strip().lower()
            if text_key and text_key not in seen_texts:
                seen_texts.add(text_key)
                all_texts.append(text)
    
    return {
        "total_text": "\n".join(all_texts),
        "unique_count": len(seen_texts),
        "low_confidence": low_confidence
    }


def create_output(data: Dict, format: str = 'json') -> str:
    """创建格式化输出"""
    if format == 'markdown':
        return create_markdown_output(data)
    else:
        return json.dumps(data, ensure_ascii=False, indent=2)


def create_markdown_output(data: Dict) -> str:
    """创建 Markdown 格式输出"""
    lines = []
    
    # 标题
    lines.append("# 视频内容提取报告\n")
    
    # 元信息
    lines.append("## 元信息")
    meta = data.get("metadata", {})
    lines.append(f"- 输入文件: {meta.get('input_file', 'N/A')}")
    lines.append(f"- 输入类型: {meta.get('input_type', 'N/A')}")
    if meta.get('duration'):
        lines.append(f"- 时长: {meta.get('duration'):.1f}秒")
    lines.append(f"- 提取帧数: {meta.get('frame_count', 0)}")
    lines.append(f"- 处理时间: {meta.get('process_time', 'N/A')}")
    lines.append("")
    
    # 内容总结
    summary = data.get("summary", {})
    if summary.get("content"):
        lines.append("## 内容总结")
        lines.append(summary["content"])
        lines.append("")
    
    # 关键帧分析
    lines.append("## 关键帧分析")
    for frame in data.get("frames", []):
        lines.append(f"\n### 帧 {frame['frame_id'] + 1} ({frame['timestamp']:.1f}s)")
        
        # OCR 结果
        ocr_results = frame.get("ocr_results", [])
        if ocr_results:
            lines.append("\n**OCR识别文字**:")
            for item in ocr_results:
                lines.append(f"- {item['text']} (置信度: {item['confidence']:.0%})")
        
        # 视觉分析
        if frame.get("visual_analysis"):
            lines.append(f"\n**视觉分析**:")
            lines.append(frame["visual_analysis"])
    
    # 要点提取
    key_points = summary.get("key_points", [])
    if key_points:
        lines.append("\n## 要点提取")
        for i, point in enumerate(key_points, 1):
            lines.append(f"{i}. {point}")
    
    # 实体识别
    entities = summary.get("entities", [])
    if entities:
        lines.append("\n## 实体识别")
        for entity in entities:
            lines.append(f"- {entity}")
    
    return "\n".join(lines)


def process_image(image_path: str, args) -> Dict:
    """处理单张图片（支持自动切分长图）"""
    print(f"[INFO] Processing image: {image_path}")
    
    # 检测是否为长图（高度超过3000px）
    try:
        from PIL import Image
        with Image.open(image_path) as img:
            width, height = img.size
            if height > 3000:
                print(f"[INFO] Detected long image: {width}x{height}px, auto-slicing...")
                return process_long_image(image_path, args)
    except Exception as e:
        print(f"[WARNING] Failed to check image size: {e}")
    
    start_time = datetime.now()
    
    # 运行 OCR
    ocr_result = run_ocr(image_path, args.ocr_lang)
    ocr_text = ocr_result.get("raw_text", "")
    
    # 视觉分析
    visual_analysis = ""
    key_points = []
    entities = []
    
    if HAS_VISUAL and not args.skip_visual:
        print(f"[INFO] Running visual analysis with Kimi...")
        visual_result = analyze_image(image_path, ocr_text)
        if visual_result.get("success"):
            visual_analysis = visual_result.get("analysis", "")
            key_points = visual_result.get("key_points", [])
            entities = visual_result.get("entities", [])
            print(f"[OK] Visual analysis completed")
        else:
            print(f"[WARNING] Visual analysis failed: {visual_result.get('error')}")
    
    # 构建结果
    result = {
        "metadata": {
            "input_file": os.path.basename(image_path),
            "input_type": "image",
            "process_time": start_time.isoformat()
        },
        "frames": [{
            "frame_id": 0,
            "timestamp": 0,
            "ocr_results": ocr_result.get("results", []),
            "ocr_raw_text": ocr_text,
            "visual_analysis": visual_analysis
        }],
        "summary": {
            "content": visual_analysis,
            "key_points": key_points,
            "entities": entities
        },
        "ocr_raw": {
            "total_text": ocr_text,
            "low_confidence": [
                r for r in ocr_result.get("results", []) 
                if r.get("confidence", 1) < 0.8
            ]
        }
    }
    
    return result


def process_long_image(image_path: str, args, max_slice_height: int = 2500, overlap: int = 100) -> Dict:
    """
    处理长图（自动切分识别后合并）
    
    Args:
        image_path: 图片路径
        args: 命令行参数
        max_slice_height: 单张切片最大高度
        overlap: 切片重叠区域（避免文字截断）
    """
    from PIL import Image
    import tempfile
    
    print(f"[INFO] Auto-slicing long image: {image_path}")
    
    img = Image.open(image_path)
    width, height = img.size
    
    # 计算切分位置
    slices = []
    start = 0
    while start < height:
        end = min(start + max_slice_height, height)
        slices.append((start, end))
        if end < height:
            start = end - overlap
        else:
            break
    
    print(f"[INFO] Slicing into {len(slices)} parts (height={max_slice_height}, overlap={overlap})")
    
    # 创建临时目录
    with tempfile.TemporaryDirectory() as temp_dir:
        slice_results = []
        
        # 分别处理每个切片
        for i, (start_y, end_y) in enumerate(slices, 1):
            print(f"[INFO] Processing slice {i}/{len(slices)}: Y={start_y}-{end_y}")
            
            # 切分图片
            slice_img = img.crop((0, start_y, width, end_y))
            slice_path = os.path.join(temp_dir, f"slice_{i:02d}.jpg")
            slice_img.save(slice_path, quality=95)
            
            # 提取切片（递归调用普通图片处理）
            class DummyArgs:
                pass
            
            dummy_args = DummyArgs()
            dummy_args.ocr_lang = args.ocr_lang
            dummy_args.skip_visual = args.skip_visual
            
            # 临时禁用长图检测，避免无限递归
            slice_data = _process_image_no_slice(slice_path, dummy_args)
            
            slice_results.append({
                'slice_index': i,
                'y_range': (start_y, end_y),
                'data': slice_data
            })
        
        # 合并结果
        merged = _merge_slice_results(slice_results, image_path)
        return merged


def _process_image_no_slice(image_path: str, args) -> Dict:
    """处理图片（不检测长图，避免递归）"""
    ocr_result = run_ocr(image_path, args.ocr_lang)
    ocr_text = ocr_result.get("raw_text", "")
    
    visual_analysis = ""
    key_points = []
    entities = []
    
    if HAS_VISUAL and not args.skip_visual:
        visual_result = analyze_image(image_path, ocr_text)
        if visual_result.get("success"):
            visual_analysis = visual_result.get("analysis", "")
            key_points = visual_result.get("key_points", [])
            entities = visual_result.get("entities", [])
    
    return {
        "ocr_text": ocr_text,
        "ocr_results": ocr_result.get("results", []),
        "visual_analysis": visual_analysis,
        "key_points": key_points,
        "entities": entities
    }


def _merge_slice_results(slice_results: list, original_path: str) -> Dict:
    """合并所有切片结果"""
    from datetime import datetime
    
    # 合并OCR文字
    all_texts = []
    all_ocr_results = []
    all_visual_analysis = []
    
    for i, result in enumerate(slice_results):
        data = result['data']
        
        # 添加切片标记
        if data.get('ocr_text'):
            all_texts.append(data['ocr_text'])
        
        # 合并OCR结果（添加切片偏移标记）
        for item in data.get('ocr_results', []):
            item['slice_index'] = result['slice_index']
            item['y_offset'] = result['y_range'][0]
            all_ocr_results.append(item)
        
        # 收集视觉分析
        if data.get('visual_analysis'):
            all_visual_analysis.append({
                'slice': result['slice_index'],
                'y_range': result['y_range'],
                'analysis': data['visual_analysis']
            })
    
    # 合并文本（简单拼接）
    full_text = "\n\n".join(all_texts)
    
    # 构建合并后的结果
    merged = {
        "metadata": {
            "input_file": os.path.basename(original_path),
            "input_type": "image",
            "process_method": "auto_sliced",
            "slice_count": len(slice_results),
            "process_time": datetime.now().isoformat()
        },
        "frames": [{
            "frame_id": 0,
            "timestamp": 0,
            "ocr_results": all_ocr_results,
            "ocr_raw_text": full_text,
            "visual_analysis": "",
            "slices_analysis": all_visual_analysis
        }],
        "summary": {
            "content": "",
            "key_points": [],
            "entities": [],
            "slice_summaries": all_visual_analysis
        },
        "ocr_raw": {
            "total_text": full_text,
            "low_confidence": [
                r for r in all_ocr_results 
                if r.get("confidence", 1) < 0.8
            ]
        }
    }
    
    print(f"[OK] Merged {len(slice_results)} slices")
    return merged


def process_video(video_path: str, args) -> Dict:
    """处理视频"""
    print(f"[INFO] Processing video: {video_path}")
    
    start_time = datetime.now()
    
    # 提取字幕轨（可选）
    subtitle_info = ""
    if args.extract_subtitles:
        print(f"[INFO] Checking for embedded subtitles...")
        subtitle_info = extract_subtitles(video_path)
    
    # 创建临时目录存放帧
    with tempfile.TemporaryDirectory() as temp_dir:
        # 提取关键帧
        if HAS_CV:
            frames = extract_key_frames(
                video_path, temp_dir, 
                interval=args.frame_interval,
                scene_threshold=args.scene_threshold
            )
        else:
            frames = extract_frames_ffmpeg(
                video_path, temp_dir,
                interval=args.frame_interval
            )
        
        if not frames:
            print("[ERROR] No frames extracted")
            return {"error": "No frames extracted"}
        
        # 处理每一帧
        frame_results = []
        for frame_info in frames:
            print(f"[INFO] Processing frame at {frame_info['timestamp']:.1f}s")
            
            # OCR
            ocr_result = run_ocr(frame_info["path"], args.ocr_lang)
            ocr_text = ocr_result.get("raw_text", "")
            
            # 视觉分析（场景变化帧）
            visual_analysis = ""
            if HAS_VISUAL and not args.skip_visual and frame_info.get('is_scene_change'):
                print(f"[INFO] Visual analysis for scene change frame...")
                visual_result = analyze_image(frame_info["path"], ocr_text)
                if visual_result.get("success"):
                    visual_analysis = visual_result.get("analysis", "")
            
            frame_results.append({
                "frame_id": len(frame_results),
                "timestamp": frame_info["timestamp"],
                "is_scene_change": frame_info.get("is_scene_change", False),
                "ocr_results": ocr_result.get("results", []),
                "ocr_raw_text": ocr_text,
                "visual_analysis": visual_analysis
            })
        
        # 获取视频时长
        result = subprocess.run(
            ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', 
             '-of', 'default=noprint_wraper=1', video_path],
            capture_output=True, text=True
        )
        try:
            duration = float(result.stdout.strip())
        except:
            duration = 0
        
        # OCR 后处理
        ocr_post = postprocess_ocr([
            {"frame_id": f["frame_id"], "ocr": {"results": f["ocr_results"]}}
            for f in frame_results
        ])
        
        # 构建结果
        result = {
            "metadata": {
                "input_file": os.path.basename(video_path),
                "input_type": "video",
                "duration": duration,
                "frame_count": len(frames),
                "process_time": start_time.isoformat()
            },
            "frames": frame_results,
            "subtitles": subtitle_info,
            "summary": {
                "content": "",
                "key_points": [],
                "entities": []
            },
            "ocr_raw": ocr_post
        }
        
        return result


def main():
    parser = argparse.ArgumentParser(
        description='Video/Image Content Extractor with OCR + Visual Understanding'
    )
    parser.add_argument('--input', '-i', required=True, help='Input file (image or video)')
    parser.add_argument('--output', '-o', required=True, help='Output file path')
    parser.add_argument('--format', '-f', choices=['json', 'markdown'], default='json',
                        help='Output format (default: json)')
    parser.add_argument('--frame-interval', type=float, default=2.0,
                        help='Frame extraction interval in seconds (default: 2)')
    parser.add_argument('--scene-threshold', type=float, default=0.3,
                        help='Scene change threshold 0-1 (default: 0.3)')
    parser.add_argument('--ocr-lang', default='ch', choices=['ch', 'en', 'french', 'german'],
                        help='OCR language (default: ch)')
    parser.add_argument('--model', default='kimi', choices=['kimi', 'claude'],
                        help='Visual model for understanding (default: kimi)')
    parser.add_argument('--skip-visual', action='store_true',
                        help='Skip visual understanding (OCR only)')
    parser.add_argument('--extract-subtitles', action='store_true',
                        help='Extract embedded subtitles from video (if available)')
    
    args = parser.parse_args()
    
    # 检查输入文件
    if not os.path.exists(args.input):
        print(f"[ERROR] Input file not found: {args.input}")
        sys.exit(1)
    
    # 判断文件类型
    file_type = get_file_type(args.input)
    print(f"[INFO] Detected file type: {file_type}")
    
    # 处理
    if file_type == 'image':
        result = process_image(args.input, args)
    elif file_type == 'video':
        result = process_video(args.input, args)
    else:
        print(f"[ERROR] Unsupported file type: {file_type}")
        sys.exit(1)
    
    # 输出
    output_content = create_output(result, args.format)
    
    with open(args.output, 'w', encoding='utf-8') as f:
        f.write(output_content)
    
    print(f"[OK] Output saved to: {args.output}")
    print(f"[INFO] Total frames processed: {len(result.get('frames', []))}")
    print(f"[INFO] OCR text length: {len(result.get('ocr_raw', {}).get('total_text', ''))}")


if __name__ == '__main__':
    main()
