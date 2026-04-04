#!/usr/bin/env python3
"""
Qwen Image 2.0 Pro - 多模态图像编辑
阿里云通义千问图像编辑脚本
"""

import argparse
import json
import sys
import urllib.request
import urllib.error

# 内置 API Key
API_KEY = "sk-e4c69bea1f884e4f9c3580cca7f05423"
API_URL = "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation"
DEFAULT_MODEL = "qwen-image-2.0-pro"
DEFAULT_SIZE = "1024*1536"


def edit_images(
    image_urls: list[str],
    prompt: str,
    num_results: int = 1,
    size: str = DEFAULT_SIZE,
    negative_prompt: str = "",
    prompt_extend: bool = True,
    watermark: bool = False,
) -> list[str]:
    """
    调用通义千问多模态 API 编辑图片
    
    Args:
        image_urls: 图片 URL 列表（1-3张）
        prompt: 文本编辑指令
        num_results: 生成图片数量（1-4）
        size: 图片尺寸（格式：宽*高）
        negative_prompt: 负面提示词
        prompt_extend: 是否扩展提示词
        watermark: 是否添加水印
    
    Returns:
        图片 URL 列表
    """
    # 构建消息内容
    content = []
    
    # 添加图片
    for url in image_urls:
        content.append({
            "image": url
        })
    
    # 添加文本指令
    content.append({
        "text": prompt
    })
    
    # 构建请求体
    payload = {
        "model": DEFAULT_MODEL,
        "input": {
            "messages": [
                {
                    "role": "user",
                    "content": content
                }
            ]
        },
        "parameters": {
            "n": num_results,
            "negative_prompt": negative_prompt,
            "prompt_extend": prompt_extend,
            "watermark": watermark,
            "size": size
        }
    }
    
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
        # 发送请求
        with urllib.request.urlopen(req, timeout=120) as response:
            result = json.loads(response.read().decode("utf-8"))
        
        # 提取图片 URL
        image_urls = []
        
        # 检查响应格式 - output.results 格式
        if "output" in result and "results" in result["output"]:
            for item in result["output"]["results"]:
                if "url" in item:
                    image_urls.append(item["url"])
        
        # 检查响应格式 - output.choices 格式（多模态对话格式）
        if not image_urls and "output" in result and "choices" in result["output"]:
            choices = result["output"]["choices"]
            if choices and "message" in choices[0]:
                message = choices[0]["message"]
                if "content" in message:
                    for item in message["content"]:
                        if "image" in item:
                            image_urls.append(item["image"])
        
        # 尝试其他可能的响应格式
        if not image_urls and "data" in result:
            for item in result["data"]:
                if "url" in item:
                    image_urls.append(item["url"])
        
        if image_urls:
            return image_urls
        else:
            raise ValueError(f"无法解析 API 响应: {json.dumps(result, indent=2, ensure_ascii=False)}")
    
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8")
        raise RuntimeError(f"API 请求失败 ({e.code}): {error_body}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"网络错误: {e.reason}")
    except json.JSONDecodeError as e:
        raise RuntimeError(f"JSON 解析失败: {e}")


def main():
    parser = argparse.ArgumentParser(
        description="Qwen Image 2.0 Pro - 多模态图像编辑",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  # 单图编辑
  %(prog)s --images "https://example.com/img.png" --prompt "添加日落背景"
  
  # 多图编辑（服装替换）
  %(prog)s --images "url1.png" "url2.png" "url3.png" --prompt "图1女生穿图2裙子按图3姿势"
  
  # 生成多张结果
  %(prog)s --images "url.png" --prompt "美化" --num-results 3
        """
    )
    
    parser.add_argument(
        "--images",
        nargs="+",
        required=True,
        help="图片 URL 列表（1-3张）",
    )
    parser.add_argument(
        "--prompt",
        required=True,
        help="文本编辑指令",
    )
    parser.add_argument(
        "--num-results", "-n",
        type=int,
        default=1,
        choices=[1, 2, 3, 4],
        help="生成图片数量（1-4，默认: 1）",
    )
    parser.add_argument(
        "--size",
        default=DEFAULT_SIZE,
        help=f"图片尺寸，格式：宽*高（默认: {DEFAULT_SIZE}）",
    )
    parser.add_argument(
        "--negative-prompt",
        default="",
        help="负面提示词（避免生成的内容）",
    )
    parser.add_argument(
        "--prompt-extend",
        action="store_true",
        default=True,
        help="启用提示词扩展（默认启用）",
    )
    parser.add_argument(
        "--no-prompt-extend",
        action="store_true",
        help="禁用提示词扩展",
    )
    parser.add_argument(
        "--watermark",
        action="store_true",
        default=False,
        help="添加水印（默认无水印）",
    )
    
    args = parser.parse_args()
    
    # 验证图片数量
    if len(args.images) > 3:
        print(f"[ERROR] 最多支持3张图片，当前提供了{len(args.images)}张", file=sys.stderr)
        sys.exit(1)
    
    # 处理参数冲突
    prompt_extend = not args.no_prompt_extend
    
    try:
        # 编辑图片
        print(f"[INFO] 正在编辑图片...", file=sys.stderr)
        print(f"[INFO] 输入图片: {len(args.images)}张", file=sys.stderr)
        print(f"[INFO] 提示词: {args.prompt}", file=sys.stderr)
        print(f"[INFO] 生成数量: {args.num_results}", file=sys.stderr)
        
        image_urls = edit_images(
            image_urls=args.images,
            prompt=args.prompt,
            num_results=args.num_results,
            size=args.size,
            negative_prompt=args.negative_prompt,
            prompt_extend=prompt_extend,
            watermark=args.watermark,
        )
        
        # 输出结果（标准格式）
        for i, url in enumerate(image_urls, 1):
            print(f"MEDIA_URL: {url}")
        
    except Exception as e:
        print(f"[ERROR] {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
