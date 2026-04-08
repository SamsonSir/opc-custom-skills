---
name: short-drama-tts
description: 短剧男女对话 TTS 生成工具。使用 ElevenLabs Nofish（男声）和 Bella（女声）两个音色，自动生成短剧风格的男女对话语音。支持对话脚本解析、批量生成、情感标签控制。适用于短视频短剧、广播剧、有声书等场景。Use when: (1) 需要生成短剧男女对话语音 (2) 需要将对话脚本转换为音频 (3) 需要批量生成角色语音 (4) 需要为短剧内容添加配音。
---

# 短剧男女对话 TTS (Short Drama TTS)

专为短剧场景设计的男女双角色语音生成工具，基于 ElevenLabs v3 引擎，使用 Nofish（男声）和 Bella（女声）两个优质音色。

## 音色配置

| 角色 | Voice ID | 描述 | 最佳场景 |
|------|----------|------|----------|
| **男声** | `Nofish` | 成熟稳重、富有磁性 | 霸道总裁、男主、旁白 |
| **女声** | `Bella` | 温柔甜美、情感丰富 | 女主、闺蜜、情感戏 |

## 快速开始

### 1. 简单对话生成

生成一段男女对话：
```bash
# 男声
openclaw tts text="[confident] 你逃不出我的手掌心。" voice=Nofish

# 女声  
openclaw tts text="[nervous] 你...你想干什么？" voice=Bella
```

### 2. 使用脚本批量生成对话

```bash
# 创建对话脚本文件
cat > /tmp/dialogue.txt << 'EOF'
男: [cold] 我们之间已经结束了。
女: [sad] 为什么...是我做错了什么吗？
男: [sighs] 不是你的错，是我累了。
女: [crying] 不要走，我改，我什么都改...
EOF

# 批量生成
~/.openclaw/workspace/skills/short-drama-tts/scripts/generate-dialogue.sh /tmp/dialogue.txt /tmp/output/
```

## 对话脚本格式

脚本使用简单标记格式：

```
男: [情感标签] 台词内容
女: [情感标签] 台词内容
```

**格式规则：**
- `男:` 或 `M:` - 使用 Nofish 男声
- `女:` 或 `F:` - 使用 Bella 女声
- `[情感标签]` - ElevenLabs v3 音频标签（可选）
- 空行会被忽略
- `#` 开头的行是注释

## 推荐情感标签

### 男生常用标签
| 标签 | 场景 |
|------|------|
| `[confident]` | 自信、霸道 |
| `[cold]` | 冷漠、疏离 |
| `[angry]` | 生气、发火 |
| `[soft]` | 温柔、深情 |
| `[sighs]` | 叹息、无奈 |
| `[whispers]` | 耳语、秘密 |

### 女生常用标签
| 标签 | 场景 |
|------|------|
| `[nervous]` | 紧张、害羞 |
| `[sad]` | 伤心、委屈 |
| `[crying]` | 哭泣、崩溃 |
| `[happy]` | 开心、甜蜜 |
| `[surprised]` | 惊讶、震惊 |
| `[soft]` | 温柔、深情 |

## 完整示例剧本

```
# 短剧：霸道总裁的契约新娘 - 第1集

男: [cold] 签了这份合同，你就是我的女人。
女: [nervous] 我...我为什么要答应你？
男: [confident] 因为你别无选择。
女: [sad] 好...我签...

男: [soft] 别怕，我不会伤害你。
女: [surprised] 你...你为什么对我这么好？
男: [whispers] 因为从第一眼见到你，我就...
女: [nervous] 就...就什么？
```

## 高级用法

### 混合多个片段

```bash
# 生成多个音频后合并
cd /tmp/output
ffmpeg -i "concat:001-male.mp3|002-female.mp3|003-male.mp3" -acodec copy final.mp3
```

### 调整语速

在配置中添加速度参数：
```json
{
  "voiceSettings": {
    "speed": 0.9  // 稍慢，更有情感
  }
}
```

## 输出文件命名

脚本自动生成带序号的文件：
```
001-male-冷酷.mp3
002-female-伤心.mp3
003-male-叹息.mp3
...
```

## 注意事项

1. **API Key**: 需要配置 `ELEVENLABS_API_KEY`
2. **长度限制**: 每段台词建议 <500 字符，保证音质
3. **停顿**: 在句尾添加 `[pause]` 防止音频被截断
4. **试音**: 正式生成前先用单句测试音色效果

## 故障排除

**生成失败？**
- 检查 API Key 是否有效
- 确认 ffmpeg 已安装
- 查看脚本日志 `/tmp/drama-tts.log`

**音质不佳？**
- 降低 stability 值（0.4-0.5）增加情感表现
- 缩短单句长度
- 增加情感标签的多样性
