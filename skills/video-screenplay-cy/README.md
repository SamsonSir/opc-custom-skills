# video-screenplay-cy 🎬

将文本内容（视频字幕、文稿、大纲、会议记录、播客文稿等）转换为专业的**剧本**和**分镜脚本**。

## 功能

- **剧本生成**：角色表、场景划分、台词/旁白、动作描述、转场标记
- **分镜脚本生成**：9 字段标准分镜表（镜号、景别、运镜、画面描述、台词/旁白、音效/音乐、时长、转场、备注）
- **智能类型识别**：自动判断内容类型（教程/Vlog/访谈/叙事/展示），应用对应策略
- **Dramatron 分层法**：梗概 → 角色 → 场景 → 台词 → 分镜，逐步生成

## 使用方法

### 前置条件

上下文中需要已有文本内容（字幕、文稿等）。可以通过以下方式获取：
- 使用 `bilibili-data-cy` 获取 B 站视频字幕
- 直接粘贴文稿/大纲
- 上传文档

### 触发

在上下文已有文本内容后，对 Claude 说：
- "把这些字幕转成剧本"
- "生成分镜脚本"
- "帮我写个剧本和分镜"

### 输出

- **剧本**：Markdown 格式，包含角色表、场景划分、完整台词和动作描述
- **分镜**：Markdown 表格格式，标准 9 字段分镜表

## 支持的内容类型

| 类型 | 场景切分依据 | 景别倾向 |
|------|------------|---------|
| 教程/知识 | 步骤/知识点 | 中景→特写 |
| Vlog/旅行 | 地点变化 | 全景→近景 |
| 访谈/对话 | 话题/说话人切换 | 中景交替 |
| 叙事/剧情 | 戏剧弧 | 全范围 |
| 数据/展示 | 主题段/数据点 | 中景+特写 |

## 安装

```bash
# 添加到 Claude Code skills
claude mcp add-skill video-screenplay-cy /path/to/video-screenplay-cy
```

## 与 bilibili-data-cy 的配合

两个技能职责完全分离：
1. **bilibili-data-cy**：获取 B 站视频数据（字幕、弹幕、评论等）
2. **video-screenplay-cy**：将文本内容转换为剧本/分镜

典型工作流：
```
用户：获取 BV1xxx 的字幕 → bilibili-data-cy 执行
用户：把这些字幕转成剧本 → video-screenplay-cy 执行
```

## 参考资料

- `references/screenplay-format.md` - 中文剧本格式规范
- `references/storyboard-format.md` - 分镜脚本格式规范
- `references/video-type-strategies.md` - 视频类型识别与处理策略
