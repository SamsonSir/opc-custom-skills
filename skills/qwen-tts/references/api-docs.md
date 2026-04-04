# Qwen TTS API Reference

## Overview

Alibaba Cloud DashScope Qwen TTS provides high-quality text-to-speech synthesis with advanced features including voice cloning, instruction control, and streaming output.

## API Versions

### V1 API (sambert-zhichu-v1)
- Standard quality TTS
- Lower latency
- Good for real-time applications

### V2 API (cosyvoice-v1)
- Higher quality synthesis
- Better prosody and naturalness
- Supports voice cloning
- Recommended for production use

## Voice Options

### Standard Voices (V1)
| Voice ID | Description | Use Case |
|----------|-------------|----------|
| longxiaochun | Female, warm, natural | General purpose |
| longxiaoxia | Female, lively, energetic | Marketing, promotions |
| longxiaocheng | Male, mature, steady | News, narration |
| longxiaobai | Female, gentle, soft | Audiobooks, meditation |
| longlaotie | Male, friendly, casual | Social media |
| longshu | Male, mature, storytelling | Storytelling |
| longshuo | Male, professional, news | News broadcasting |
| longjing | Female, calm, peaceful | Meditation, sleep |
| longhua | Female, sweet, cute | Children's content |

### High-Quality Voices (V2)
| Voice ID | Description | Use Case |
|----------|-------------|----------|
| zhixiaobai | Female, clear, professional | Business, IVR |
| zhixiaoxia | Female, warm, friendly | Customer service |
| zhixiaocheng | Male, steady, professional | Presentations |
| zhilaoba | Male, elderly, kind | Storytelling |
| zhishu | Male, scholarly, calm | Educational |
| zhixiaomei | Female, young, lively | Entertainment |

## Instruction Control

Use natural language instructions to control speech characteristics:

| Instruction | Effect |
|-------------|--------|
| `用开心的语气说话` | Happy tone |
| `用悲伤的语气说话` | Sad tone |
| `用生气的语气说话` | Angry tone |
| `用温柔的语气说话` | Gentle tone |
| `用严肃的语气说话` | Serious tone |
| `语速快一点` | Faster speech rate |
| `语速慢一点` | Slower speech rate |
| `声音大一点` | Louder volume |
| `声音小一点` | Quieter volume |

## Voice Cloning

Voice cloning requires:
- Reference audio file (WAV or MP3 format)
- Minimum 3 seconds of clear speech
- Single speaker, no background noise

## Pricing

| Model | Price per 1K characters |
|-------|------------------------|
| sambert-zhichu-v1 | ¥0.02 |
| cosyvoice-v1 | ¥0.05 |

## Rate Limits

| Tier | Requests per minute | Characters per minute |
|------|--------------------|---------------------|
| Free | 20 | 10,000 |
| Standard | 100 | 50,000 |
| Premium | 500 | 200,000 |

## Error Codes

| Code | Description | Solution |
|------|-------------|----------|
| 400 | Bad request | Check text length and parameters |
| 401 | Unauthorized | Verify API key |
| 429 | Rate limited | Reduce request frequency |
| 500 | Server error | Retry with exponential backoff |
