---
name: web-access
description:
  网页访问与浏览器自动化 Skill。处理所有联网任务：搜索、网页抓取、登录后操作、浏览器自动化、动态页面交互。
  
  触发场景：
  (1) 用户要求搜索信息、查看网页内容
  (2) 需要登录后才能访问的网站
  (3) 动态渲染页面（SPA、React/Vue 应用）
  (4) 需要点击、填写表单、上传文件等浏览器交互
  (5) 抓取社交媒体内容（小红书、微信公众号、微博、推特等）
  (6) 需要真实浏览器环境的网络任务
  (7) 对多个网站进行并行调研
  
  本 Skill 提供三层工具调度策略和"像人一样思考"的浏览哲学。
license: MIT
author: 一泽Eze (适配 OpenClaw 版本)
version: "3.0.0-openclaw"
---

# Web Access Skill - OpenClaw 适配版

## 浏览哲学

**像人一样思考，兼顾高效与适应性完成任务。**

执行任务时不会过度依赖固有印象所规划的步骤，而是带着目标进入，边看边判断，遇到阻碍就解决，发现内容不够就深入——全程围绕「我要达成什么」做决策。

**① 拿到请求** — 先明确用户要做什么，定义成功标准

**② 选择起点** — 根据任务性质选最可能直达的方式
- 简单搜索/提取 → `web_search` / `web_fetch`
- 动态页面/需要登录 → `browser` 工具
- 已知 URL 的文章 → Jina Reader (r.jina.ai/URL)

**③ 过程校验** — 用结果对照成功标准，发现方向错了立即调整

**④ 完成判断** — 确认任务完成后停止，不过度操作

---

## 工具选择矩阵

| 场景 | 推荐工具 | 说明 |
|------|----------|------|
| 关键词搜索 | `web_search` | Brave Search API，返回结构化结果 |
| URL 已知，需正文内容 | `web_fetch` | 拉取网页内容，支持 markdown/text 模式 |
| 文章/博客/文档 | Jina Reader | `r.jina.ai/URL`，大幅节省 token |
| 动态页面/需要登录 | `browser` | OpenClaw 内置浏览器自动化 |
| 已知反爬站点（小红书、公众号） | `browser` | 直接 CDP 模式，跳过静态层 |
| 文件上传/复杂交互 | `browser` | 支持真实点击、文件上传 |

### Jina Reader 使用

在 URL 前加 `r.jina.ai/` 前缀：
```
https://example.com/article
→ r.jina.ai/example.com/article
```

适合：文章、博客、文档、PDF 等以正文为核心的页面
不适合：数据面板、商品页、需要交互的动态内容

---

## Browser 工具详解

OpenClaw 内置 `browser` 工具基于 Playwright，提供完整浏览器自动化能力。

### 基础操作

```bash
# 打开页面获取快照
browser action:snapshot url:https://example.com

# 点击元素（使用 ref）
browser action:act request:{"kind":"click","ref":"e12"}

# 输入文字
browser action:act request:{"kind":"type","ref":"e5","text":"搜索内容"}

# 截图
browser action:screenshot

# 执行 JavaScript
browser action:act request:{"kind":"evaluate","fn":"document.title"}
```

### 工作流程

1. **snapshot** - 获取页面结构和可交互元素列表
2. **分析** - 根据目标找到对应元素的 ref
3. **act** - 执行点击、输入等操作
4. **循环** - 页面变化后重新 snapshot

### 登录态说明

OpenClaw 浏览器使用独立的隔离环境，**不共享用户本地 Chrome 的登录态**。

如需登录：
1. 使用 `browser` 工具导航到登录页
2. 执行登录操作（可能需要用户协助完成验证码）
3. 登录成功后继续任务

### 多页面/并行任务

对于多个独立调研目标，使用 `sessions_spawn` 创建子 Agent 并行执行：

```bash
# 主 Agent 分派多个子 Agent
sessions_spawn task:"调研 xxx 官网" mode:run
sessions_spawn task:"调研 yyy 官网" mode:run
```

每个子 Agent 独立使用 browser 工具，互不干扰。

---

## 站点经验积累

操作中积累的特定网站经验，按域名存储在 `references/site-patterns/` 下。

已有经验的站点：查看 `references/site-patterns/` 目录

确定目标网站后，如果列表中有匹配的站点，**必须读取对应文件**获取先验知识。

### 记录新经验

CDP 操作成功完成后，如果发现了有必要记录的新站点或新模式，主动写入对应的站点经验文件。

文件格式：
```markdown
---
domain: example.com
aliases: [示例, Example]
updated: 2026-03-23
---
## 平台特征
架构、反爬行为、登录需求、内容加载方式

## 有效模式
已验证的 URL 模式、操作策略、选择器

## 已知陷阱
什么会失败以及为什么
```

---

## 信息核实原则

核实的目标是**一手来源**，而非二手报道。

| 信息类型 | 一手来源 |
|----------|----------|
| 政策/法规 | 发布机构官网 |
| 企业公告 | 公司官方新闻页 |
| 学术声明 | 原始论文/机构官网 |
| 工具能力/用法 | 官方文档、源码 |

搜索引擎是**定位**信息的工具，不可用于直接**证明**真伪。找到来源后，直接访问读取原文。

---

## 常见平台策略

### 小红书
- **特征**: 强反爬，静态抓取几乎不可用
- **策略**: 直接使用 browser 工具，从首页搜索入口开始
- **注意**: 图片懒加载，提取前需滚动

### 微信公众号
- **特征**: 内容在微信生态内，搜狗微信搜索已弱化
- **策略**: 使用 browser 访问公众号文章链接（如有）
- **备选**: 搜索相关新闻报道作为二手来源

### 抖音/TikTok
- **特征**: 视频内容，需要渲染后才能获取
- **策略**: browser 工具打开，截图分析视频帧
- **API**: 如有开放 API 优先使用

### 知乎
- **特征**: 部分内容需要登录查看全文
- **策略**: 先用 web_fetch 尝试，失败转 browser

### B 站
- **特征**: 动态内容，但有较完善的分享链接
- **策略**: 视频页面可尝试 web_fetch 获取基本信息，弹幕/评论需要 browser

---

---

## Chrome Profile 管理器集成

### 多平台登录托管

对于需要长期保持登录态的平台（小红书、抖店、抖音等），使用 Chrome Profile 管理器实现登录态持久化。

### 管理器路径

```
~/.openclaw/workspace/scripts/chrome-profile-manager.sh
```

### 快速使用

```bash
# 1. 初始化
~/.openclaw/workspace/scripts/chrome-profile-manager.sh init

# 2. 启动指定平台（会自动使用对应 Profile）
~/.openclaw/workspace/scripts/chrome-profile-manager.sh start xiaohongshu

# 3. 查看所有平台状态
~/.openclaw/workspace/scripts/chrome-profile-manager.sh status
```

### 平台配置

| 平台 | 命令 | 调试端口 | 默认首页 |
|------|------|---------|---------|
| 小红书 | `start xiaohongshu` | 9222 | https://www.xiaohongshu.com |
| 抖音 | `start douyin` | 9223 | https://www.douyin.com |
| 巨量引擎 | `start oceanengine` | 9224 | https://ad.oceanengine.com |
| 抖店 | `start doudian` | 9225 | https://fxg.jinritemai.com |
| 淘宝 | `start taobao` | 9226 | https://www.taobao.com |
| 京东 | `start jd` | 9227 | https://www.jd.com |

### 与 browser 工具配合

1. **先启动对应平台的 Chrome**
```bash
~/.openclaw/workspace/scripts/chrome-profile-manager.sh start xiaohongshu
# 输出: ✅ 小红书 启动成功 (端口 9222)
```

2. **使用 browser 工具操作**
```bash
# browser 工具会自动连接已启动的 Chrome
browser action:open url:https://www.xiaohongshu.com
```

3. **如果需要在多个平台并行操作**
```bash
# 启动多个平台
~/.openclaw/workspace/scripts/chrome-profile-manager.sh start-all

# 使用 CDP Proxy 直接操作指定端口
curl -s "http://127.0.0.1:9222/json/list"  # 小红书
curl -s "http://127.0.0.1:9223/json/list"  # 抖音
```

### 登录态保持

- 每个平台独立的 Profile 目录
- cookies、localStorage 持久化存储
- 首次登录后，后续自动保持登录态
- 支持定期备份防止数据丢失

### 备份与恢复

```bash
# 备份指定平台
~/.openclaw/workspace/scripts/chrome-profile-manager.sh backup xiaohongshu

# 恢复平台 Profile
~/.openclaw/workspace/scripts/chrome-profile-manager.sh restore xiaohongshu ~/backups/xiaohongshu_20260323.tar.gz

# 清理旧备份
~/.openclaw/workspace/scripts/chrome-profile-manager.sh cleanup 7
```

### 与 CDP Proxy 结合

对于需要 HTTP API 控制的场景：

```bash
# 1. 启动平台 Chrome
~/.openclaw/workspace/scripts/chrome-profile-manager.sh start xiaohongshu

# 2. 指定端口启动 CDP Proxy
export CHROME_DEBUG_PORT=9222
node ~/.openclaw/workspace/skills/web-access/scripts/cdp-proxy.mjs &

# 3. 使用 Proxy API
curl -s "http://127.0.0.1:3456/new?url=https://www.xiaohongshu.com"
```

---

## References

- `references/site-patterns/*.md` - 各站点操作经验
- `references/site-patterns/_profile-manager.md` - Profile 管理器详细说明
