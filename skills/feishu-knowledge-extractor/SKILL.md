# feishu-knowledge-extractor

飞书知识库（Wiki）自动提取与同步工具。支持增量更新、AI 提纯、主题分类。

## 适用场景

- 定期备份飞书 Wiki 知识库到本地 Markdown
- 自动归档每日更新的知识库文章
- 将文章按主题分类到不同目录

## 前置要求

- 飞书应用已开通 `docx:document:readonly` 权限
- 用户已授权飞书 Wiki 访问
- 配置好 Claude API 或 Kimi API 用于内容提纯

## 安装

```bash
# 安装到 OpenClaw 技能目录
ln -s ~/.openclaw/workspace/skills/feishu-knowledge-extractor ~/.openclaw/skills/
```

## 配置

创建 `.env` 文件：

```bash
# 飞书应用凭证
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx

# AI 提纯 API（二选一）
KIMI_API_KEY=sk-kimi-xxx
# 或
ANTHROPIC_API_KEY=sk-xxx

# 可选：索引文档 token（默认 WaytoAGI）
INDEX_DOC_TOKEN=XjxvwwCZ7ijJMxkJ3SucrVEUn4p
```

## 使用

### 1. 完整索引重建（首次运行）

```bash
feishu-extractor --rebuild-index
```

解析飞书 Wiki 索引页，生成 `index_map.json`（日期 -> 文章 token 映射）。

### 2. 增量更新（日常）

```bash
feishu-extractor --incremental
```

- 拉取最新索引
- 检测新增文章
- 自动下载、提纯、分类
- Git 提交

### 3. 处理指定日期

```bash
feishu-extractor --date 2026-03-15
```

### 4. 批量处理日期范围

```bash
feishu-extractor --range 2026-03-01 2026-03-15
```

## 输出结构

```
workspace/
├── daily/
│   ├── 2026-03-15.md      # 每日合并日报
│   └── 2026-03-14.md
├── topics/
│   ├── AI编程与开发工具/
│   ├── Agent与技能系统/
│   └── ...
├── data/
│   ├── index_map.json     # 日期->文章token映射
│   ├── classification.json # 主题分类配置
│   └── extract-state.json # 处理状态
└── _images/               # 文章图片（可选）
```

## 关键实现细节

### 索引解析陷阱

飞书 Wiki 索引页结构：
- **日期标题**：`heading1` (block_type=3)，格式如 "3月15日收录"
- **文章链接**：空 `text` block (block_type=2) 包含 `mention_doc.token`

**注意**：API 返回字段是 `token` 不是 `obj_token`！

### 增量逻辑

```python
# 每天凌晨执行
new_map = parse_index_map(blocks)  # 重新全量解析
old_map = load_index_map()
added = new_map[today] - old_map.get(today, [])  # diff 出新增
```

### 监控保护

解析异常时（0日期/数量骤降）自动退出，保护已有数据：

```python
if not check_parse_health(date_count, today):
    sys.exit(1)  # 不覆盖 index_map
```

## 坑点总结

1. **不要假设 block_type**：日期可能在 heading，文章链接在空 text
2. **不要假设字段名**：`token` vs `obj_token`
3. **不要假设格式**："3月15日" 不一定有 "收录" 后缀
4. **不要静默失败**：解析异常必须告警
5. **优先查 OpenClaw 原生能力**：飞书插件已有 `feishu_fetch_doc`

## License

MIT - OPC (One Person Company) 内部使用
