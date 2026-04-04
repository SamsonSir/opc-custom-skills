#!/usr/bin/env python3
"""
Qwen TTS CLI v3.0 - 阿里云百炼千问语音合成
默认输出 OPUS 格式，音质高、体积小

特性：
- 40+ 系统音色 (Momo, Cherry, Ethan 等)
- 自动转换为 OPUS (24k 比特率)
- 支持指令控制、声音复刻、声音设计
"""

import argparse
import os
import sys
import json
import base64
import requests
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

# 完整的系统音色列表 (40+ 音色)
VOICE_OPTIONS = {
    # 中文普通话 - 女性
    "Cherry": "芊悦 - 阳光积极、亲切自然小姐姐",
    "Serena": "苏瑶 - 温柔小姐姐", 
    "Chelsie": "千雪 - 二次元虚拟女友",
    "Momo": "茉兔 - 撒娇搞怪，逗你开心",
    "Vivian": "十三 - 拽拽的、可爱的小暴躁",
    "Maia": "四月 - 知性与温柔的碰撞",
    "Bella": "萌宝 - 喝酒不打醉拳的小萝莉",
    "Bunny": "萌小姬 - 萌属性爆棚的小萝莉",
    "Nini": "邻家妹妹 - 糯米糍一样又软又黏",
    "Stella": "少女阿月 - 代表月亮消灭你",
    "Mia": "乖小妹 - 温顺如春水，乖巧如初雪",
    "Bellona": "燕铮莺 - 声音洪亮，吐字清晰",
    "Sohee": "素熙 - 温柔开朗，情绪丰富的韩国欧尼",
    "Ono Anna": "小野杏 - 鬼灵精怪的青梅竹马",
    "Kiki": "阿清 - 甜美的港妹闺蜜",
    
    # 中文普通话 - 男性
    "Ethan": "晨煦 - 阳光、温暖、活力、朝气",
    "Moon": "月白 - 率性帅气的月白",
    "Kai": "凯 - 耳朵的一场SPA",
    "Nofish": "不吃鱼 - 不会翘舌音的设计师",
    "Eldric Sage": "沧明子 - 沉稳睿智的老者",
    "Mochi": "沙小弥 - 聪明伶俐的小大人",
    "Vincent": "田叔 - 独特的沙哑烟嗓",
    "Neil": "阿闻 - 专业的新闻主持人",
    "Arthur": "徐大爷 - 被岁月浸泡过的质朴嗓音",
    "Pip": "顽屁小孩 - 调皮捣蛋的小新",
    "Alek": "阿列克 - 战斗民族的冷暖",
    "Andre": "安德雷 - 磁性沉稳男生",
    "Radio Gol": "拉迪奥·戈尔 - 足球诗人",
    
    # 英文
    "Jennifer": "詹妮弗 - 品牌级、电影质感美语女声",
    "Ryan": "甜茶 - 节奏拉满，戏感炸裂",
    "Katerina": "卡捷琳娜 - 御姐音色",
    "Aiden": "艾登 - 精通厨艺的美语大男孩",
    
    # 其他语言
    "Bodega": "博德加 - 热情的西班牙大叔",
    "Sonrisa": "索尼莎 - 热情开朗的拉美大姐",
    "Dolce": "多尔切 - 慵懒的意大利大叔",
    "Lenn": "莱恩 - 穿西装也听后朋克的德国青年",
    "Emilien": "埃米尔安 - 浪漫的法国大哥哥",
    
    # 中国方言
    "Jada": "上海-阿珍 - 风风火火的沪上阿姐",
    "Dylan": "北京-晓东 - 北京胡同里长大的少年",
    "Li": "南京-老李 - 耐心的瑜伽老师",
    "Marcus": "陕西-秦川 - 面宽话短，心实声沉",
    "Roy": "闽南-阿杰 - 诙谐直爽的台湾哥仔",
    "Peter": "天津-李彼得 - 天津相声，专业捧哏",
    "Sunny": "四川-晴儿 - 甜到你心里的川妹子",
    "Eric": "四川-程川 - 跳脱市井的成都男子",
    "Rocky": "粤语-阿强 - 幽默风趣的阿强",
}

def get_api_key() -> str:
    """获取 DashScope API key"""
    api_key = os.environ.get("DASHSCOPE_API_KEY")
    if not api_key:
        config_path = Path.home() / ".config" / "qwen-tts" / "config.json"
        if config_path.exists():
            with open(config_path, "r") as f:
                config = json.load(f)
                api_key = config.get("api_key")
    if not api_key:
        print("Error: DASHSCOPE_API_KEY not set")
        print("请设置环境变量或创建 ~/.config/qwen-tts/config.json")
        sys.exit(1)
    return api_key

def wav_to_opus(wav_path: str, opus_path: str, bitrate: str = "24k") -> bool:
    """将 WAV 转换为 OPUS"""
    try:
        result = subprocess.run(
            ["ffmpeg", "-i", wav_path, "-c:a", "libopus", "-b:a", bitrate, 
             "-vbr", "on", "-y", opus_path],
            capture_output=True,
            text=True
        )
        return result.returncode == 0
    except FileNotFoundError:
        print("Error: ffmpeg not found. Please install ffmpeg.")
        return False

def synthesize(
    text: str,
    voice: str,
    output_path: str,
    api_key: str,
    model: str = "qwen3-tts-flash",
    instruction: Optional[str] = None,
    keep_wav: bool = False,
) -> None:
    """语音合成并转换为 OPUS"""
    
    # 确定输出路径
    if output_path.endswith('.wav'):
        output_path = output_path[:-4] + '.opus'
    elif not output_path.endswith('.opus'):
        output_path = output_path + '.opus'
    
    # 创建临时 WAV 文件
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
        wav_path = tmp.name
    
    try:
        # 第一步：调用 API 生成 WAV
        print(f"🎙️  合成语音: {voice}")
        
        url = "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation"
        
        payload = {
            "model": model,
            "input": {
                "text": text,
                "voice": voice,
            }
        }
        
        if instruction:
            payload["input"]["instructions"] = instruction
            payload["input"]["optimize_instructions"] = True
        
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        
        response = requests.post(url, json=payload, headers=headers)
        response.raise_for_status()
        result = response.json()
        
        if 'output' in result and 'audio' in result['output']:
            audio_url = result['output']['audio']['url']
            audio_response = requests.get(audio_url)
            with open(wav_path, "wb") as f:
                f.write(audio_response.content)
        else:
            print(f"Error: API 返回格式异常")
            sys.exit(1)
        
        # 第二步：转换为 OPUS
        print(f"🔄 转换为 OPUS...")
        if wav_to_opus(wav_path, output_path):
            wav_size = os.path.getsize(wav_path)
            opus_size = os.path.getsize(output_path)
            compression = (1 - opus_size / wav_size) * 100
            print(f"✅ 完成! {wav_size/1024:.1f}KB → {opus_size/1024:.1f}KB (压缩 {compression:.0f}%)")
        else:
            # 转换失败，保留 WAV
            print("⚠️  OPUS 转换失败，保留 WAV 格式")
            output_path = output_path[:-5] + '.wav'
            os.rename(wav_path, output_path)
            return
        
        # 清理临时文件
        if not keep_wav and os.path.exists(wav_path):
            os.unlink(wav_path)
        
        print(f"📁 保存到: {output_path}")
        
    except Exception as e:
        # 清理临时文件
        if os.path.exists(wav_path):
            os.unlink(wav_path)
        print(f"Error: {e}")
        sys.exit(1)

def list_voices():
    """列出所有音色"""
    print("=" * 70)
    print("🎵 Qwen TTS - 40+ 系统音色 (默认输出 OPUS)")
    print("=" * 70)
    
    categories = {
        "⭐ 中文普通话 - 女性": ["Cherry", "Serena", "Chelsie", "Momo", "Vivian", "Maia", "Bella", "Bunny", "Nini", "Stella", "Mia"],
        "中文普通话 - 男性": ["Ethan", "Moon", "Kai", "Nofish", "Eldric Sage", "Mochi", "Vincent", "Neil", "Arthur", "Pip"],
        "方言": ["Jada", "Dylan", "Li", "Marcus", "Roy", "Peter", "Sunny", "Eric", "Rocky"],
        "英文": ["Jennifer", "Ryan", "Katerina", "Aiden"],
    }
    
    for category, voices in categories.items():
        print(f"\n{category}:")
        for voice in voices:
            if voice in VOICE_OPTIONS:
                marker = " 🐰 你喜欢的!" if voice == "Momo" else ""
                print(f"  {voice:<15} - {VOICE_OPTIONS[voice]}{marker}")
    
    print("\n" + "=" * 70)
    print("💡 提示: 使用 --voice 指定音色，默认为 Momo")
    print("💡 输出: 默认 OPUS 格式 (.opus)，体积小、音质高")

def main():
    parser = argparse.ArgumentParser(
        description="Qwen TTS v3.0 - 默认输出 OPUS 格式",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  # 使用 Momo 生成撒娇语音 (默认输出 OPUS)
  qwen-tts --text "哥哥，陪人家玩嘛~" --output momo

  # 使用指令控制情感
  qwen-tts --text "好开心呀！" --instruction "用开心的语气说话" -o happy

  # 保留 WAV 文件
  qwen-tts --text "你好" --keep-wav -o hello

  # 查看所有音色
  qwen-tts --list-voices
        """
    )
    
    parser.add_argument("--text", "-t", help="要合成的文本")
    parser.add_argument("--voice", "-v", default="Momo", help="音色 (默认: Momo)")
    parser.add_argument("--output", "-o", help="输出文件名 (不含扩展名，默认 .opus)")
    parser.add_argument("--model", "-m", default="qwen3-tts-flash", help="模型")
    parser.add_argument("--instruction", "-i", help="指令控制")
    parser.add_argument("--keep-wav", action="store_true", help="保留中间 WAV 文件")
    parser.add_argument("--list-voices", action="store_true", help="列出色表")
    parser.add_argument("--api-key", help="API Key")
    
    args = parser.parse_args()
    
    if args.list_voices:
        list_voices()
        return
    
    if not args.text or not args.output:
        parser.print_help()
        sys.exit(1)
    
    api_key = args.api_key or get_api_key()
    
    synthesize(
        text=args.text,
        voice=args.voice,
        output_path=args.output,
        api_key=api_key,
        model=args.model,
        instruction=args.instruction,
        keep_wav=args.keep_wav,
    )

if __name__ == "__main__":
    main()
