#!/usr/bin/env python3
"""
Seedream-5.0 AI Image Generator
火山引擎图片生成脚本
"""

import argparse
import json
import sys
import urllib.request
import urllib.error

# 内置 API Key
API_KEY = "59ffabe7-fba8-4b4e-8d30-bbe13ddca111"
API_URL = "https://ark.cn-beijing.volces.com/api/v3/images/generations"
DEFAULT_MODEL = "doubao-seedream-5-0-260128"
DEFAULT_SIZE = "2K"


def generate_image(
    prompt: str,
    size: str = DEFAULT_SIZE,
    model: str = DEFAULT_MODEL,
    watermark: bool = True,
    stream: bool = False,
) -> str:
    """
    调用火山引擎 Seedream API 生成图片
    
    Args:
        prompt: 文本提示词
        size: 图片尺寸 (2K, 4K, 或具体像素)
        model: 模型 ID
        watermark: 是否添加水印
        stream: 是否流式输出
    
    Returns:
        图片 URL
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
        with urllib.request.urlopen(req, timeout=60) as response:
            result = json.loads(response.read().decode("utf-8"))
        
        # 提取图片 URL
        if "data" in result and len(result["data"]) > 0:
            image_url = result["data"][0].get("url")
            if image_url:
                return image_url
            else:
                raise ValueError("响应中未找到图片 URL")
        else:
            raise ValueError(f"API 响应格式异常: {result}")
    
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8")
        raise RuntimeError(f"API 请求失败 ({e.code}): {error_body}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"网络错误: {e.reason}")
    except json.JSONDecodeError as e:
        raise RuntimeError(f"JSON 解析失败: {e}")


def main():
    parser = argparse.ArgumentParser(
        description="Seedream-5.0 AI 图片生成器",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    
    parser.add_argument(
        "--prompt",
        required=True,
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
    
    args = parser.parse_args()
    
    # 处理水印参数
    watermark = not args.no_watermark
    
    try:
        # 生成图片
        print(f"[INFO] 正在生成图片...", file=sys.stderr)
        print(f"[INFO] 提示词: {args.prompt}", file=sys.stderr)
        print(f"[INFO] 尺寸: {args.size}", file=sys.stderr)
        
        image_url = generate_image(
            prompt=args.prompt,
            size=args.size,
            model=args.model,
            watermark=watermark,
            stream=args.stream,
        )
        
        # 输出结果（标准格式）
        print(f"MEDIA_URL: {image_url}")
        
    except Exception as e:
        print(f"[ERROR] {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
