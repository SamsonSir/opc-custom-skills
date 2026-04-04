#!/usr/bin/env python3
"""
Seedream-5.0 AI Image Generator v2.0
火山引擎图片生成脚本 - 支持主题模板、批量生成、并发请求
"""

import argparse
import json
import sys
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Dict, Optional
from dataclasses import dataclass, asdict
from pathlib import Path
import time

# 内置 API Key
API_KEY = "59ffabe7-fba8-4b4e-8d30-bbe13ddca111"
API_URL = "https://ark.cn-beijing.volces.com/api/v3/images/generations"
DEFAULT_MODEL = "doubao-seedream-5-0-260128"
DEFAULT_SIZE = "2K"


# ============== 主题模板库 ==============
THEME_TEMPLATES = {
    "xiaohongshu_cover": {
        "name": "小红书封面",
        "prefix": "小红书封面设计，大字报风格，",
        "suffix": "，现代简约风格，高对比度配色，16:9比例，鲜艳色彩，吸引眼球",
        "size": "1920x2560"
    },
    "xiaohongshu_tech": {
        "name": "小红书科技",
        "prefix": "科技类小红书封面，",
        "suffix": "，蓝色科技感配色，简洁大气，霓虹光效，现代极简风格，吸引眼球",
        "size": "1920x2560"
    },
    "xiaohongshu_education": {
        "name": "小红书教育",
        "prefix": "教育类小红书封面，学习路线图设计，",
        "suffix": "，信息图表风格，简洁大气，渐变背景，专业感，吸引眼球",
        "size": "1920x2560"
    },
    "poster": {
        "name": "海报",
        "prefix": "海报设计，",
        "suffix": "，高端质感，视觉冲击力，专业设计，印刷级品质",
        "size": "2k"
    },
    "avatar": {
        "name": "头像",
        "prefix": "头像设计，",
        "suffix": "，圆形构图，高清质感，专业摄影风格，社交媒体适用",
        "size": "1920x1920"
    },
    "banner": {
        "name": "横幅",
        "prefix": "横幅Banner设计，",
        "suffix": "，宽屏布局，渐变背景，商业风格，高清质感",
        "size": "1920x1080"
    },
    "illustration": {
        "name": "插画",
        "prefix": "插画风格，",
        "suffix": "，细腻笔触，艺术感，高清细节，创意构图",
        "size": "2k"
    },
    "product": {
        "name": "产品图",
        "prefix": "产品摄影，",
        "suffix": "，专业布光，白底或场景，商业摄影，高端质感，细节清晰",
        "size": "2k"
    }
}


@dataclass
class GenerationTask:
    """生成任务"""
    id: str
    prompt: str
    size: str
    theme: Optional[str] = None
    negative_prompt: Optional[str] = None
    retry: int = 0
    max_retries: int = 3


@dataclass
class GenerationResult:
    """生成结果"""
    task_id: str
    success: bool
    image_url: Optional[str] = None
    error: Optional[str] = None
    duration: float = 0.0
    theme: Optional[str] = None


def apply_theme(prompt: str, theme: Optional[str]) -> tuple[str, str]:
    """
    应用主题模板
    
    Returns:
        (处理后的提示词, 尺寸)
    """
    if not theme or theme not in THEME_TEMPLATES:
        return prompt, DEFAULT_SIZE
    
    template = THEME_TEMPLATES[theme]
    full_prompt = f"{template['prefix']}{prompt}{template['suffix']}"
    return full_prompt, template.get("size", DEFAULT_SIZE)


def generate_image(
    prompt: str,
    size: str = DEFAULT_SIZE,
    model: str = DEFAULT_MODEL,
    watermark: bool = True,
    stream: bool = False,
    negative_prompt: Optional[str] = None,
    n: int = 1,
) -> List[str]:
    """
    调用火山引擎 Seedream API 生成图片
    
    Args:
        prompt: 文本提示词
        size: 图片尺寸
        model: 模型 ID
        watermark: 是否添加水印
        stream: 是否流式输出
        negative_prompt: 负面提示词
        n: 生成图片数量 (1-4)
    
    Returns:
        图片 URL 列表
    """
    # 构建请求体
    payload = {
        "model": model,
        "prompt": prompt,
        "sequential_image_generation": "disabled",
        "response_format": "url",
        "size": size,
        "stream": stream,
        "watermark": watermark,
        "n": min(max(n, 1), 4),  # 限制 1-4
    }
    
    if negative_prompt:
        payload["negative_prompt"] = negative_prompt
    
    # 构建请求
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {API_KEY}",
    }
    
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        API_URL,
        data=data,
        headers=headers,
        method="POST",
    )
    
    try:
        with urllib.request.urlopen(req, timeout=120) as response:
            result = json.loads(response.read().decode("utf-8"))
        
        urls = []
        if "data" in result:
            for item in result["data"]:
                if "url" in item:
                    urls.append(item["url"])
        
        if not urls:
            raise ValueError(f"API 响应格式异常: {result}")
        
        return urls
    
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8")
        raise RuntimeError(f"API 请求失败 ({e.code}): {error_body}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"网络错误: {e.reason}")
    except json.JSONDecodeError as e:
        raise RuntimeError(f"JSON 解析失败: {e}")


def generate_single_task(task: GenerationTask, watermark: bool = True, model: str = DEFAULT_MODEL) -> GenerationResult:
    """执行单个生成任务（带重试）"""
    start_time = time.time()
    
    for attempt in range(task.max_retries):
        try:
            urls = generate_image(
                prompt=task.prompt,
                size=task.size,
                model=model,
                watermark=watermark,
                negative_prompt=task.negative_prompt,
                n=1,
            )
            
            return GenerationResult(
                task_id=task.id,
                success=True,
                image_url=urls[0] if urls else None,
                duration=time.time() - start_time,
                theme=task.theme
            )
        
        except Exception as e:
            if attempt == task.max_retries - 1:
                return GenerationResult(
                    task_id=task.id,
                    success=False,
                    error=str(e),
                    duration=time.time() - start_time,
                    theme=task.theme
                )
            time.sleep(1 * (attempt + 1))  # 指数退避
    
    return GenerationResult(
        task_id=task.id,
        success=False,
        error="Max retries exceeded",
        duration=time.time() - start_time,
        theme=task.theme
    )


def batch_generate(
    tasks: List[GenerationTask],
    max_workers: int = 3,
    watermark: bool = True,
    model: str = DEFAULT_MODEL,
) -> List[GenerationResult]:
    """
    批量生成图片（并发）
    
    Args:
        tasks: 任务列表
        max_workers: 最大并发数
        watermark: 是否添加水印
        model: 模型 ID
    
    Returns:
        结果列表
    """
    results = []
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # 提交所有任务
        future_to_task = {
            executor.submit(generate_single_task, task, watermark, model): task
            for task in tasks
        }
        
        # 收集结果
        for future in as_completed(future_to_task):
            result = future.result()
            results.append(result)
            
            # 实时输出进度
            status = "✅" if result.success else "❌"
            print(f"[{status}] Task {result.task_id}: {result.image_url if result.success else result.error}", 
                  file=sys.stderr)
    
    return results


def load_prompts_from_file(filepath: str) -> List[str]:
    """从文件加载提示词列表"""
    path = Path(filepath)
    if not path.exists():
        raise FileNotFoundError(f"文件不存在: {filepath}")
    
    content = path.read_text(encoding="utf-8")
    # 支持多种分隔：每行一个，或JSON数组
    lines = [line.strip() for line in content.split('\n') if line.strip()]
    
    # 尝试解析为JSON
    try:
        data = json.loads(content)
        if isinstance(data, list):
            return [str(item) for item in data]
    except:
        pass
    
    return lines


def list_themes():
    """列出所有可用主题"""
    print("📋 可用主题模板：")
    print("-" * 50)
    for key, template in THEME_TEMPLATES.items():
        print(f"  {key:<20} - {template['name']:<10} (默认尺寸: {template['size']})")
    print("-" * 50)


def main():
    parser = argparse.ArgumentParser(
        description="Seedream-5.0 AI 图片生成器 v2.0 - 支持主题模板、批量生成、并发请求",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
使用示例:
  # 单张生成（基础）
  python generate_image_v2.py --prompt "赛博朋克城市"
  
  # 使用主题模板
  python generate_image_v2.py --prompt "月入3W的秘密" --theme xiaohongshu_cover
  
  # 批量生成（并发）
  python generate_image_v2.py --batch prompts.txt --workers 5
  
  # 一次生成多张不同图
  python generate_image_v2.py --prompt "星空" --num-results 4
  
  # 列表查看所有主题
  python generate_image_v2.py --list-themes
        """
    )
    
    # 基础参数
    parser.add_argument(
        "--prompt",
        help="文本提示词（支持中英文）",
    )
    parser.add_argument(
        "--size",
        default=DEFAULT_SIZE,
        help=f"图片尺寸（默认: {DEFAULT_SIZE}，支持: 2K, 4K, 或具体像素如 2048x2048）",
    )
    parser.add_argument(
        "--model",
        default=DEFAULT_MODEL,
        help=f"模型 ID（默认: {DEFAULT_MODEL}）",
    )
    parser.add_argument(
        "--watermark",
        action="store_true",
        default=True,
        help="添加水印（默认启用）",
    )
    parser.add_argument(
        "--no-watermark",
        action="store_true",
        help="不添加水印",
    )
    parser.add_argument(
        "--stream",
        action="store_true",
        help="流式输出",
    )
    
    # 新增：主题模板
    parser.add_argument(
        "--theme",
        choices=list(THEME_TEMPLATES.keys()),
        help="使用预设主题模板",
    )
    parser.add_argument(
        "--list-themes",
        action="store_true",
        help="列出所有可用主题模板",
    )
    
    # 新增：批量生成
    parser.add_argument(
        "--batch",
        metavar="FILE",
        help="从文件批量读取提示词（每行一个，或JSON数组）",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=3,
        help="并发工作线程数（默认: 3）",
    )
    
    # 新增：一次生成多张
    parser.add_argument(
        "--num-results",
        "-n",
        type=int,
        default=1,
        help="单次生成图片数量（1-4，默认: 1）",
    )
    
    # 新增：负面提示词
    parser.add_argument(
        "--negative-prompt",
        help="负面提示词（不希望出现的内容）",
    )
    
    # 新增：输出格式
    parser.add_argument(
        "--output-json",
        action="store_true",
        help="以JSON格式输出结果",
    )
    
    args = parser.parse_args()
    
    # 列出主题
    if args.list_themes:
        list_themes()
        return
    
    # 处理水印参数
    watermark = not args.no_watermark
    
    # 批量模式
    if args.batch:
        try:
            prompts = load_prompts_from_file(args.batch)
            print(f"[INFO] 加载 {len(prompts)} 个提示词，并发数: {args.workers}", file=sys.stderr)
            
            # 构建任务列表
            tasks = []
            for i, prompt in enumerate(prompts, 1):
                final_prompt, size = apply_theme(prompt, args.theme)
                tasks.append(GenerationTask(
                    id=f"{i:03d}",
                    prompt=final_prompt,
                    size=size,
                    theme=args.theme,
                    negative_prompt=args.negative_prompt
                ))
            
            # 并发执行
            results = batch_generate(tasks, args.workers, watermark, args.model)
            
            # 输出结果
            if args.output_json:
                output = [asdict(r) for r in results]
                print(json.dumps(output, ensure_ascii=False, indent=2))
            else:
                for r in sorted(results, key=lambda x: x.task_id):
                    if r.success:
                        print(f"MEDIA_URL_{r.task_id}: {r.image_url}")
                    else:
                        print(f"ERROR_{r.task_id}: {r.error}")
            
            # 统计
            success_count = sum(1 for r in results if r.success)
            print(f"\n[INFO] 完成: {success_count}/{len(results)} 成功", file=sys.stderr)
            
        except Exception as e:
            print(f"[ERROR] {e}", file=sys.stderr)
            sys.exit(1)
    
    # 单条模式
    elif args.prompt:
        try:
            # 应用主题模板
            final_prompt, size = apply_theme(args.prompt, args.theme)
            
            print(f"[INFO] 正在生成图片...", file=sys.stderr)
            if args.theme:
                print(f"[INFO] 主题: {THEME_TEMPLATES[args.theme]['name']}", file=sys.stderr)
            print(f"[INFO] 提示词: {final_prompt}", file=sys.stderr)
            print(f"[INFO] 尺寸: {size}", file=sys.stderr)
            print(f"[INFO] 数量: {args.num_results}", file=sys.stderr)
            
            urls = generate_image(
                prompt=final_prompt,
                size=size,
                model=args.model,
                watermark=watermark,
                stream=args.stream,
                negative_prompt=args.negative_prompt,
                n=args.num_results,
            )
            
            for i, url in enumerate(urls, 1):
                suffix = f"_{i}" if len(urls) > 1 else ""
                print(f"MEDIA_URL{suffix}: {url}")
                
        except Exception as e:
            print(f"[ERROR] {e}", file=sys.stderr)
            sys.exit(1)
    
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
