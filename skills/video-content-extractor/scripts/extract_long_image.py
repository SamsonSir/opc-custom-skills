#!/usr/bin/env python3
"""
video-content-extractor 智能切分提取模块
自动检测并切分超长图片，分别识别后合并结果
"""

import argparse
import json
import os
import sys
from pathlib import Path
from datetime import datetime
from PIL import Image
import subprocess

# 切分配置
MAX_SLICE_HEIGHT = 2500  # 单张最大高度（像素）
OVERLAP = 100  # 切分重叠区域（避免文字被截断）

class LongImageProcessor:
    """长图处理器"""
    
    def __init__(self, model='kimi', ocr_lang='ch'):
        self.model = model
        self.ocr_lang = ocr_lang
        self.project_root = Path(__file__).parent.parent
        
    def needs_slicing(self, image_path):
        """检测图片是否需要切分"""
        with Image.open(image_path) as img:
            width, height = img.size
            return height > MAX_SLICE_HEIGHT, (width, height)
            
    def calculate_slices(self, total_height):
        """计算切分位置"""
        slices = []
        start = 0
        
        while start < total_height:
            end = min(start + MAX_SLICE_HEIGHT, total_height)
            slices.append((start, end))
            
            # 下一张起始位置（考虑重叠）
            if end < total_height:
                start = end - OVERLAP
            else:
                break
                
        return slices
        
    def slice_image(self, image_path, output_dir):
        """切分图片"""
        img = Image.open(image_path)
        width, height = img.size
        
        # 计算切分
        slices = self.calculate_slices(height)
        slice_files = []
        
        print(f"🖼️  原图尺寸: {width}x{height}")
        print(f"✂️  切分为 {len(slices)} 张 (每张最大{MAX_SLICE_HEIGHT}px, 重叠{OVERLAP}px)")
        print()
        
        for i, (start_y, end_y) in enumerate(slices, 1):
            # 切分
            slice_img = img.crop((0, start_y, width, end_y))
            
            # 保存
            slice_path = Path(output_dir) / f"slice_{i:02d}_{start_y}_{end_y}.jpg"
            slice_img.save(slice_path, quality=95)
            slice_files.append({
                'path': str(slice_path),
                'index': i,
                'range': (start_y, end_y),
                'height': end_y - start_y
            })
            
        return slice_files
        
    def extract_single(self, image_path, output_path, format='json'):
        """提取单张图片"""
        cmd = [
            'python3', str(self.project_root / 'scripts' / 'extract.py'),
            '--input', str(image_path),
            '--output', str(output_path),
            '--format', format,
            '--ocr-lang', self.ocr_lang
        ]
        
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            return result.returncode == 0
        except Exception as e:
            print(f"❌ 提取失败: {e}")
            return False
            
    def merge_results(self, slice_results, original_file):
        """合并所有切片结果"""
        merged = {
            'metadata': {
                'original_file': str(original_file),
                'process_method': 'sliced_extraction',
                'slice_count': len(slice_results),
                'max_slice_height': MAX_SLICE_HEIGHT,
                'overlap': OVERLAP,
                'process_time': datetime.now().isoformat()
            },
            'slices': [],
            'merged_content': {
                'full_text': '',
                'all_ocr_results': [],
                'visual_analysis': []
            }
        }
        
        full_text_parts = []
        
        for i, result in enumerate(slice_results, 1):
            if result.get('success') and Path(result['output']).exists():
                with open(result['output'], 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    
                slice_info = {
                    'slice_index': i,
                    'y_range': result['range'],
                    'height': result['height'],
                    'ocr_text': data.get('frames', [{}])[0].get('ocr_raw_text', ''),
                    'visual_analysis': data.get('frames', [{}])[0].get('visual_analysis', '')
                }
                
                merged['slices'].append(slice_info)
                
                # 合并文本
                if slice_info['ocr_text']:
                    full_text_parts.append(slice_info['ocr_text'])
                    
                # 合并OCR结果
                ocr_results = data.get('frames', [{}])[0].get('ocr_results', [])
                for item in ocr_results:
                    item['slice_index'] = i
                    item['slice_y_offset'] = result['range'][0]
                merged['merged_content']['all_ocr_results'].extend(ocr_results)
                
                # 合并视觉分析
                if slice_info['visual_analysis']:
                    merged['merged_content']['visual_analysis'].append({
                        'slice': i,
                        'analysis': slice_info['visual_analysis']
                    })
                    
        # 去重合并文本
        merged['merged_content']['full_text'] = self._deduplicate_text(full_text_parts)
        
        return merged
        
    def _deduplicate_text(self, text_parts):
        """去重合并文本（处理重叠区域）"""
        if not text_parts:
            return ''
            
        # 简单去重：检查相邻部分的末尾和开头是否有重复
        result = text_parts[0]
        
        for part in text_parts[1:]:
            # 找重叠部分
            overlap_len = min(len(result), len(part), OVERLAP * 2)
            found = False
            
            for i in range(overlap_len, 0, -1):
                if result[-i:] == part[:i]:
                    result += part[i:]
                    found = True
                    break
                    
            if not found:
                result += '\n' + part
                
        return result
        
    def process(self, image_path, output_path, format='json'):
        """主处理流程"""
        image_path = Path(image_path)
        temp_dir = Path('/tmp') / f"sliced_{image_path.stem}_{datetime.now().strftime('%H%M%S')}"
        temp_dir.mkdir(exist_ok=True)
        
        try:
            # 1. 检测是否需要切分
            needs_slice, (width, height) = self.needs_slicing(image_path)
            
            if not needs_slice:
                print(f"✅ 图片高度{height}px，无需切分，直接提取...")
                self.extract_single(image_path, output_path, format)
                return
                
            # 2. 切分图片
            print(f"📝 处理长图: {image_path.name}")
            slice_files = self.slice_image(image_path, temp_dir)
            
            # 3. 分别提取
            slice_results = []
            for slice_info in slice_files:
                print(f"🔍 提取切片 {slice_info['index']}/{len(slice_files)}: Y={slice_info['range'][0]}-{slice_info['range'][1]}")
                
                output_slice = temp_dir / f"result_{slice_info['index']:02d}.json"
                success = self.extract_single(slice_info['path'], output_slice, 'json')
                
                slice_results.append({
                    **slice_info,
                    'success': success,
                    'output': str(output_slice) if success else None
                })
                
            # 4. 合并结果
            print(f"\n🔄 合并 {len(slice_results)} 个切片结果...")
            merged = self.merge_results(slice_results, image_path)
            
            # 5. 保存最终输出
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(merged, f, ensure_ascii=False, indent=2)
                
            print(f"✅ 完成! 输出: {output_path}")
            print(f"📊 统计: {len([r for r in slice_results if r['success']])}/{len(slice_results)} 切片成功")
            
            # 清理临时文件（可选）
            # import shutil
            # shutil.rmtree(temp_dir)
            
        except Exception as e:
            print(f"❌ 处理失败: {e}")
            raise


def main():
    """主函数"""
    parser = argparse.ArgumentParser(
        description='video-content-extractor 长图智能切分提取',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  # 自动切分并提取长图
  python extract_long_image.py -i long_screenshot.jpg -o result.json
  
  # 指定OCR语言
  python extract_long_image.py -i doc.png -o output.json --ocr-lang en
        """
    )
    
    parser.add_argument('-i', '--input', required=True, help='输入长图路径')
    parser.add_argument('-o', '--output', required=True, help='输出文件路径')
    parser.add_argument('-f', '--format', default='json', choices=['json', 'markdown'],
                       help='输出格式 (默认: json)')
    parser.add_argument('--ocr-lang', default='ch', choices=['ch', 'en'],
                       help='OCR语言 (默认: ch)')
    parser.add_argument('--max-height', type=int, default=2500,
                       help=f'切分高度阈值 (默认: {MAX_SLICE_HEIGHT}px)')
    parser.add_argument('--overlap', type=int, default=100,
                       help=f'切分重叠区域 (默认: {OVERLAP}px)')
    
    args = parser.parse_args()
    
    # 更新配置
    global MAX_SLICE_HEIGHT, OVERLAP
    MAX_SLICE_HEIGHT = args.max_height
    OVERLAP = args.overlap
    
    # 执行
    print("=" * 60)
    print("🎬 video-content-extractor 长图智能切分提取")
    print("=" * 60)
    print()
    
    processor = LongImageProcessor(ocr_lang=args.ocr_lang)
    processor.process(args.input, args.output, args.format)


if __name__ == '__main__':
    main()
