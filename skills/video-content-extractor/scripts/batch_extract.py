#!/usr/bin/env python3
"""
video-content-extractor 批量处理脚本
支持批量处理文件夹中的图片和视频
"""

import argparse
import json
import os
import sys
import subprocess
from pathlib import Path
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

# 添加项目路径
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT / 'scripts'))

class BatchExtractor:
    """批量提取器"""
    
    # 支持的文件格式
    IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif', '.tiff'}
    VIDEO_EXTENSIONS = {'.mp4', '.mov', '.avi', '.mkv', '.flv', '.wmv', '.webm'}
    
    def __init__(self, model='kimi', ocr_lang='ch', max_workers=3):
        self.model = model
        self.ocr_lang = ocr_lang
        self.max_workers = max_workers
        
    def scan_directory(self, input_dir):
        """扫描目录，获取所有支持的文件"""
        input_path = Path(input_dir)
        all_files = []
        
        # 遍历所有支持的扩展名
        for ext in self.IMAGE_EXTENSIONS | self.VIDEO_EXTENSIONS:
            all_files.extend(input_path.glob(f'*{ext}'))
            all_files.extend(input_path.glob(f'*{ext.upper()}'))
            
        # 按文件名排序
        all_files = sorted(all_files, key=lambda x: x.name.lower())
        
        # 分类
        images = [f for f in all_files if f.suffix.lower() in self.IMAGE_EXTENSIONS]
        videos = [f for f in all_files if f.suffix.lower() in self.VIDEO_EXTENSIONS]
        
        return {
            'all': all_files,
            'images': images,
            'videos': videos
        }
        
    def process_single(self, input_file, output_dir, format='json'):
        """处理单个文件"""
        input_path = Path(input_file)
        output_path = Path(output_dir) / f"{input_path.stem}.{format}"
        
        try:
            # 构建 extract.py 命令
            cmd = [
                'python3', str(PROJECT_ROOT / 'scripts' / 'extract.py'),
                '--input', str(input_path),
                '--output', str(output_path),
                '--format', format,
                '--ocr-lang', self.ocr_lang
            ]
            
            # 执行提取
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=300  # 5分钟超时
            )
            
            if result.returncode == 0:
                return {
                    'file': input_path.name,
                    'status': 'success',
                    'output': str(output_path),
                    'type': 'image' if input_path.suffix.lower() in self.IMAGE_EXTENSIONS else 'video'
                }
            else:
                return {
                    'file': input_path.name,
                    'status': 'error',
                    'error': result.stderr or 'Unknown error',
                    'type': 'image' if input_path.suffix.lower() in self.IMAGE_EXTENSIONS else 'video'
                }
                
        except subprocess.TimeoutExpired:
            return {
                'file': input_path.name,
                'status': 'error',
                'error': 'Processing timeout (5min)',
                'type': 'image' if input_path.suffix.lower() in self.IMAGE_EXTENSIONS else 'video'
            }
        except Exception as e:
            return {
                'file': input_path.name,
                'status': 'error',
                'error': str(e),
                'type': 'image' if input_path.suffix.lower() in self.IMAGE_EXTENSIONS else 'video'
            }
            
    def process_batch(self, input_dir, output_dir, format='json', max_workers=None):
        """批量处理"""
        input_path = Path(input_dir)
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)
        
        # 扫描文件
        files_info = self.scan_directory(input_dir)
        all_files = files_info['all']
        
        if not all_files:
            print(f"⚠️  未找到支持的文件: {input_dir}")
            print(f"   支持的图片格式: {', '.join(self.IMAGE_EXTENSIONS)}")
            print(f"   支持的视频格式: {', '.join(self.VIDEO_EXTENSIONS)}")
            return None
            
        print(f"📁 扫描完成:")
        print(f"   图片: {len(files_info['images'])} 个")
        print(f"   视频: {len(files_info['videos'])} 个")
        print(f"   总计: {len(all_files)} 个\n")
        
        # 批量处理
        workers = max_workers or self.max_workers
        results = []
        completed = 0
        failed = 0
        
        print(f"🚀 开始批量处理 (并发: {workers})...\n")
        
        with ThreadPoolExecutor(max_workers=workers) as executor:
            # 提交所有任务
            future_to_file = {
                executor.submit(self.process_single, f, output_dir, format): f 
                for f in all_files
            }
            
            # 处理完成的任务
            for future in as_completed(future_to_file):
                file_path = future_to_file[future]
                try:
                    result = future.result()
                    results.append(result)
                    
                    completed += 1
                    status = result['status']
                    
                    if status == 'success':
                        print(f"✅ [{completed}/{len(all_files)}] {file_path.name}")
                    else:
                        failed += 1
                        print(f"❌ [{completed}/{len(all_files)}] {file_path.name}")
                        print(f"   错误: {result.get('error', 'Unknown')}")
                        
                except Exception as e:
                    completed += 1
                    failed += 1
                    results.append({
                        'file': file_path.name,
                        'status': 'error',
                        'error': str(e)
                    })
                    print(f"❌ [{completed}/{len(all_files)}] {file_path.name}")
                    print(f"   错误: {e}")
        
        # 生成报告
        report = self._generate_report(results, input_dir, output_dir)
        
        return report
        
    def _generate_report(self, results, input_dir, output_dir):
        """生成报告"""
        total = len(results)
        success = sum(1 for r in results if r['status'] == 'success')
        failed = total - success
        
        images = sum(1 for r in results if r.get('type') == 'image')
        videos = sum(1 for r in results if r.get('type') == 'video')
        
        report = {
            'metadata': {
                'input_directory': str(input_dir),
                'output_directory': str(output_dir),
                'process_time': datetime.now().isoformat(),
                'total_files': total,
                'success_count': success,
                'failed_count': failed,
                'success_rate': f"{(success/total*100):.1f}%" if total > 0 else "0%",
                'images_total': images,
                'videos_total': videos
            },
            'results': results,
            'failed_files': [r for r in results if r['status'] == 'error']
        }
        
        # 保存报告
        report_file = Path(output_dir) / f"batch_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(report_file, 'w', encoding='utf-8') as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
            
        return report


def main():
    parser = argparse.ArgumentParser(
        description='video-content-extractor 批量处理',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  # 批量处理文件夹
  python batch_extract.py -i ./images/ -o ./results/
  
  # 输出为markdown
  python batch_extract.py -i ./images/ -o ./results/ -f markdown
  
  # 增加并发数
  python batch_extract.py -i ./images/ -o ./results/ -w 5
        """
    )
    
    parser.add_argument('-i', '--input', required=True, help='输入文件夹')
    parser.add_argument('-o', '--output', required=True, help='输出文件夹')
    parser.add_argument('-f', '--format', default='json', choices=['json', 'markdown'],
                       help='输出格式 (默认: json)')
    parser.add_argument('-w', '--workers', type=int, default=3, help='并发数 (默认: 3)')
    parser.add_argument('--ocr-lang', default='ch', choices=['ch', 'en'],
                       help='OCR语言 (默认: ch)')
    
    args = parser.parse_args()
    
    # 验证输入
    if not Path(args.input).exists():
        print(f"❌ 错误: 输入目录不存在: {args.input}")
        sys.exit(1)
    
    # 执行
    print("=" * 60)
    print("🎬 video-content-extractor 批量处理")
    print("=" * 60)
    print()
    
    extractor = BatchExtractor(ocr_lang=args.ocr_lang, max_workers=args.workers)
    report = extractor.process_batch(args.input, args.output, args.format, args.workers)
    
    if report:
        print()
        print("=" * 60)
        print("✅ 批量处理完成!")
        print("=" * 60)
        print()
        print(f"📈 统计:")
        print(f"   总计: {report['metadata']['total_files']} 个文件")
        print(f"   成功: {report['metadata']['success_count']} ({report['metadata']['success_rate']})")
        print(f"   失败: {report['metadata']['failed_count']}")
        print(f"   图片: {report['metadata']['images_total']}")
        print(f"   视频: {report['metadata']['videos_total']}")
        print()
        print(f"📄 报告: {Path(args.output) / 'batch_report_*.json'}")
        
        if report['failed_files']:
            print()
            print("⚠️  失败文件:")
            for f in report['failed_files'][:5]:
                print(f"   - {f['file']}")
            if len(report['failed_files']) > 5:
                print(f"   ... 还有 {len(report['failed_files']) - 5} 个")


if __name__ == '__main__':
    main()
