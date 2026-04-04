#!/usr/bin/env python3
"""视觉分析模块 - 调用 Kimi Coding 视觉模型（Anthropic 兼容格式）"""

import base64
import json
import os
from typing import Dict, List

def encode_image(image_path: str) -> str:
    """图片转 base64"""
    with open(image_path, 'rb') as f:
        return base64.b64encode(f.read()).decode('utf-8')

def analyze_image(image_path: str, ocr_text: str = "", api_key: str = None) -> Dict:
    """
    使用 Kimi Coding 视觉模型分析图片（Anthropic 兼容格式）
    """
    try:
        import requests
    except:
        return {"success": False, "error": "requests not installed", "analysis": ""}
    
    # API Key - 使用 KIMICODING_API_KEY 环境变量
    api_key = api_key or os.environ.get('KIMICODING_API_KEY')
    if not api_key:
        return {"success": False, "error": "KIMICODING_API_KEY not configured", "analysis": ""}
    
    # Base URL - Kimi Coding API
    base_url = os.environ.get('KIMICODING_BASE_URL', 'https://api.kimi.com/coding')
    
    # 编码图片
    try:
        image_b64 = encode_image(image_path)
    except Exception as e:
        return {"success": False, "error": f"encode failed: {e}", "analysis": ""}
    
    # 构建提示词
    prompt = f"""分析这张图片。
OCR识别到的文字（可能有误差）：{ocr_text if ocr_text else "无"}

请回答：
1. 图片主要内容是什么？
2. 有哪些关键信息？
3. 识别出哪些实体（人名、地点、品牌等）？

用中文回答。"""
    
    # 调用 Kimi Coding API（Anthropic 兼容格式）
    try:
        response = requests.post(
            f"{base_url}/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json"
            },
            json={
                "model": "k2p5",
                "max_tokens": 2000,
                "messages": [{
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/jpeg",
                                "data": image_b64
                            }
                        },
                        {
                            "type": "text",
                            "text": prompt
                        }
                    ]
                }]
            },
            timeout=60
        )
        
        if response.status_code == 200:
            result = response.json()
            content = result.get('content', [{}])[0].get('text', '')
            return {
                "success": True,
                "analysis": content,
                "key_points": extract_points(content),
                "entities": []
            }
        else:
            return {"success": False, "error": f"API {response.status_code}: {response.text}", "analysis": ""}
    
    except Exception as e:
        return {"success": False, "error": str(e), "analysis": ""}

def extract_points(text: str) -> List[str]:
    """提取要点"""
    points = []
    for line in text.split('\n'):
        line = line.strip()
        if line and (line[0].isdigit() or line.startswith('-')):
            point = line.lstrip('0123456789.- ').strip()
            if point:
                points.append(point)
    return points[:10]

if __name__ == '__main__':
    import sys
    if len(sys.argv) > 1:
        result = analyze_image(sys.argv[1])
        print(json.dumps(result, ensure_ascii=False, indent=2))
