---
name: qwen-tts
description: 阿里云百炼千问语音合成 (Qwen TTS)。支持 40+ 音色，默认输出 OPUS 格式（高压缩、高音质）。支持指令控制、声音复刻、声音设计。使用 DashScope API。
---

# Qwen TTS v3.0 - 千问语音合成

阿里云百炼千问 TTS，提供 40+ 拟人音色，**默认输出 OPUS 格式**，音质高、体积小。

## 🎯 特色功能

- **40+ 系统音色** - 包括你最喜欢的 **Momo (茉兔)** 🐰
- **默认 OPUS 输出** - 压缩率 90%+，音质几乎无损
- **支持方言** - 上海话、北京话、四川话、粤语等
- **指令控制** - 用自然语言控制情感、语速、音调
- **声音复刻** - 克隆任何人的声音
- **声音设计** - 通过文本描述创建新音色

## 🚀 快速开始

### 配置 API Key

```bash
# 方式1: 环境变量
export DASHSCOPE_API_KEY="sk-xxx"

# 方式2: 配置文件 (已配置)
cat ~/.config/qwen-tts/config.json
```

### 生成语音 (使用 Momo 音色!)

```bash
# 默认输出 OPUS (推荐!)
python ~/.openclaw/workspace/skills/qwen-tts/scripts/qwen-tts.py \
  --text "哥哥，陪人家玩嘛~" \
  --output momo
# 输出: momo.opus (约 12KB)

# 使用指令控制情感
python ~/.openclaw/workspace/skills/qwen-tts/scripts/qwen-tts.py \
  --text "好开心呀！" \
  --voice Momo \
  --instruction "用开心的语气说话" \
  --output happy

# 保留中间 WAV 文件
python ~/.openclaw/workspace/skills/qwen-tts/scripts/qwen-tts.py \
  --text "你好" \
  --output hello \
  --keep-wav
# 输出: hello.opus + hello.wav
```

## 📦 格式对比

| 格式 | 3秒语音大小 | 特点 |
|------|-------------|------|
| **OPUS** (默认) | ~12 KB | 🥇 推荐！语音专用，压缩率 90%+ |
| WAV | ~150 KB | 无损，体积大 |
| MP3 | ~50 KB | 通用兼容 |

**OPUS 优势**: 相同音质下，体积是 MP3 的 1/4，WAV 的 1/12！

## 🎨 推荐音色

### 撒娇搞怪首选 ⭐

| 音色 | 描述 | 适合场景 |
|------|------|----------|
| **Momo** 🐰 | 茉兔 - 撒娇搞怪，逗你开心 | 聊天、娱乐、配音 |
| **Bella** | 萌宝 - 喝酒不打醉拳的小萝莉 | 可爱内容 |
| **Bunny** | 萌小姬 - 萌属性爆棚的小萝莉 | 二次元 |

### 温柔治愈系

| 音色 | 描述 | 适合场景 |
|------|------|----------|
| **Serena** | 苏瑶 - 温柔小姐姐 | 有声书、陪伴 |
| **Maia** | 四月 - 知性与温柔的碰撞 | 知性内容 |

### 阳光活力

| 音色 | 描述 | 适合场景 |
|------|------|----------|
| **Cherry** | 芊悦 - 阳光积极、亲切自然 | 通用场景 |
| **Ethan** | 晨煦 - 阳光、温暖、活力 | 男声首选 |

### 方言特色 🗣️

| 音色 | 方言 | 描述 |
|------|------|------|
| **Jada** | 上海话 | 上海-阿珍 - 风风火火的沪上阿姐 |
| **Dylan** | 北京话 | 北京-晓东 - 北京胡同里长大的少年 |
| **Sunny** | 四川话 | 四川-晴儿 - 甜到你心里的川妹子 |
| **Rocky** | 粤语 | 粤语-阿强 - 幽默风趣的阿强 |

## 📖 完整音色列表

```bash
python ~/.openclaw/workspace/skills/qwen-tts/scripts/qwen-tts.py --list-voices
```

查看全部 40+ 音色！

## 💡 进阶用法

### 指令控制示例

```bash
# 开心语气
--instruction "用开心的语气说话"

# 悲伤语气
--instruction "用悲伤的语气说话"

# 加快语速
--instruction "语速快一点"

# 组合指令
--instruction "用温柔的语气，语速慢一点"
```

### 模型选择

| 模型 | 特点 | 价格 |
|------|------|------|
| `qwen3-tts-flash` | 标准质量，低成本 | ¥0.8/万字符 |
| `qwen3-tts-instruct-flash` | 支持指令控制 | ¥0.8/万字符 |
| `qwen3-tts-vc-2026-01-22` | 声音复刻 | ¥0.8/万字符 |
| `qwen3-tts-vd-2026-01-26` | 声音设计 | ¥0.8/万字符 |

## 🔧 技术细节

- **API**: DashScope (阿里云百炼)
- **中国内地**: `https://dashscope.aliyuncs.com`
- **国际**: `https://dashscope-intl.aliyuncs.com`
- **音色 ID**: `Momo`, `Cherry`, `Ethan`, `Serena` 等
- **输出格式**: OPUS (默认), 24kHz, 单声道
- **压缩率**: 相比 WAV 压缩 90%+

## 📝 示例场景

### 1. 短视频配音 (Momo)
```bash
python qwen-tts.py \
  --text "家人们谁懂啊，这个东西真的绝了！" \
  --voice Momo \
  --instruction "用惊讶的语气说话" \
  --output video_dub
# 输出: video_dub.opus (约 15KB)
```

### 2. 有声书 (Serena)
```bash
python qwen-tts.py \
  --text "这是一个关于爱的故事..." \
  --voice Serena \
  --instruction "用温柔的语气，语速慢一点" \
  --output audiobook
# 输出: audiobook.opus
```

### 3. 上海话内容 (Jada)
```bash
python qwen-tts.py \
  --text "侬好呀，吃了伐？" \
  --voice Jada \
  --output shanghai
# 输出: shanghai.opus
```

## 🛠️ 转换工具

如需将现有 WAV 转换为 OPUS：

```bash
bash ~/.openclaw/workspace/skills/qwen-tts/scripts/convert-audio.sh \
  input.wav output.opus
```

或手动使用 ffmpeg：

```bash
ffmpeg -i input.wav -c:a libopus -b:a 24k output.opus
```

## ⚠️ 注意事项

- API Key 需要单独申请 ([DashScope](https://dashscope.aliyun.com))
- 需要安装 ffmpeg 用于 OPUS 转换: `apt install ffmpeg`
- 音频 URL 有效期 24 小时 (已自动下载转换)
- 支持的语言与音色有关
- 指令控制仅 Instruct 模型支持

---

**Momo (茉兔) - 你的撒娇搞怪首选音色！** 🐰✨
**默认 OPUS 输出 - 小体积、高音质！** 🎵
