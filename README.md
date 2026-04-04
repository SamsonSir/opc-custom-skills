# OPC 自定义技能库

> 一人公司（OPC）专属 OpenClaw 技能集合

## 📋 简介

本仓库收录了 OPC（One Person Company）体系下自研的 OpenClaw 技能，涵盖电商运营、内容创作、自动化流程等多个领域。

## 🗂️ 技能分类

### 电商运营
| 技能名称 | 描述 | 版本 |
|---------|------|------|
| [1688-selection-assistant](skills/1688-selection-assistant/) | 1688选品助手，采集价格、销量和店铺评分 | v1.0 |

### 内容创作
| 技能名称 | 描述 | 版本 |
|---------|------|------|
| [video-content-extractor](skills/video-content-extractor/) | 视频内容提取，支持长图自动切分 | v2.0 |
| [video-screenplay-cy](skills/video-screenplay-cy/) | 视频转剧本和分镜脚本 | v1.0 |
| [video-auto-clip](skills/video-auto-clip/) | AI驱动的视频智能剪辑 | v1.0 |
| [wechat-typesetting-cy](skills/wechat-typesetting-cy/) | 微信公众号文章多模板排版 | v1.0 |
| [qwen-image-edit](skills/qwen-image-edit/) | 通义千问图像编辑 | v1.0 |
| [qwen-tts](skills/qwen-tts/) | 阿里云百炼千问语音合成 | v1.0 |
| [seedream](skills/seedream/) | 火山引擎Seedream图片生成 | v1.0 |
| [super-ocr](skills/super-ocr/) | 生产级OCR，支持Tesseract和PaddleOCR | v1.0 |
| [mistral-ocr](skills/mistral-ocr/) | Mistral OCR API文档转换 | v1.0 |
| [elevenlabs-tts](skills/elevenlabs-tts/) | ElevenLabs语音合成 | v1.0 |

### 小红书运营
| 技能名称 | 描述 | 版本 |
|---------|------|------|
| [xhs-auto-cy](skills/xhs-auto-cy/) | 小红书自动化工具 | v1.0 |
| [xiaohongshu-downloader](skills/xiaohongshu-downloader/) | 小红书视频下载和总结 | v1.0 |

### 闲鱼运营
| 技能名称 | 描述 | 版本 |
|---------|------|------|
| [xianyu-reply-cy](skills/xianyu-reply-cy/) | 闲鱼自动回复助手 | v1.0 |

### 自动化工具
| 技能名称 | 描述 | 版本 |
|---------|------|------|
| [auto-updater](skills/auto-updater/) | 自动更新Clawdbot和技能 | v1.0 |
| [automation-workflows](skills/automation-workflows/) | 自动化工作流设计 | v1.0 |
| [clawflows](skills/clawflows/) | 多技能自动化工作流 | v1.0 |
| [web-access](skills/web-access/) | 网页访问与浏览器自动化 | v1.0 |
| [agent-reach](skills/agent-reach/) | 平台接入工具集成 | v1.0 |

### 开发工具
| 技能名称 | 描述 | 版本 |
|---------|------|------|
| [github-kb](skills/github-kb/) | GitHub知识库管理 | v1.0 |
| [find-skills](skills/find-skills/) | 技能发现和安装助手 | v1.0 |
| [skill-vetter](skills/skill-vetter/) | 技能安全审查 | v1.0 |
| [opencli](skills/opencli/) | 网站CLI工具 | v1.0 |
| [qmd](skills/qmd/) | 本地搜索/索引CLI | v1.0 |
| [dingtalk-ai-table](skills/dingtalk-ai-table/) | 钉钉AI表格操作 | v1.0 |

### AI助手
| 技能名称 | 描述 | 版本 |
|---------|------|------|
| [memory-setup](skills/memory-setup/) | 记忆搜索配置 | v1.0 |
| [proactive-agent](skills/proactive-agent/) | 主动型Agent模式 | v1.0 |
| [local-whisper](skills/local-whisper/) | 本地语音转文字 | v1.0 |
| [ultimate-search](skills/ultimate-search/) | 双引擎网络搜索 | v1.0 |
| [baidu-search](skills/baidu-search/) | 百度搜索 | v1.0 |
| [exa-search](skills/exa-search/) | Exa AI搜索 | v1.0 |

### 系统管理
| 技能名称 | 描述 | 版本 |
|---------|------|------|
| [myclaw-backup](skills/myclaw-backup/) | OpenClaw配置备份恢复 | v1.0 |

### 飞书生态
| 技能名称 | 描述 | 版本 |
|---------|------|------|
| [feishu-doc-exporter](skills/feishu-doc-exporter/) | 飞书文档批量导出 | v1.0 |
| [feishu-meeting-call](skills/feishu-meeting-call/) | 飞书加急消息和电话 | v1.0 |

### 设计创作
| 技能名称 | 描述 | 版本 |
|---------|------|------|
| [anthropic-frontend-design](skills/anthropic-frontend-design/) | 前端界面设计 | v1.0 |
| [frontend-slides](skills/frontend-slides/) | HTML演示文稿创建 | v1.0 |

## 🚀 安装使用

```bash
# 克隆仓库
git clone https://github.com/SamsonSir/opc-custom-skills.git

# 安装技能到 OpenClaw
cd opc-custom-skills
./scripts/install-skill.sh skill-name
```

## 📝 贡献指南

1. 在 `skills/` 目录下创建新的技能文件夹
2. 编写 `SKILL.md` 描述技能功能
3. 提交 PR 到本仓库
4. 审核通过后合并到主分支

## 📊 技能统计

- 总技能数：37+
- 分类数：10+
- 最后更新：2026-04-04

## 🔗 相关链接

- [OpenClaw 官网](https://openclaw.ai)
- [ClawHub 技能市场](https://clawhub.com)
- [OPC 知识库](https://opc.feishu.cn/wiki)

---

🦞 **Made with OpenClaw by JokerSu**