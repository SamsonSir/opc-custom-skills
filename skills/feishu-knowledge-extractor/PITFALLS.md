# 飞书 Wiki 提取坑点记录

## 2026-03-16 重大故障复盘

### 故障现象
- 3月13-15日数据缺失
- 增量采集返回 0 篇
- 用户反馈后才发现

### 根本原因

#### 1. 解析逻辑写死（致命）

**错误代码：**
```python
if block_type == 2:  # 只检查 text 类型 ❌
    match = re.search(r'(\d+)月(\d+)日收录', text)  # 限定"收录"字样 ❌
    token = elem.get('mention_doc', {}).get('obj_token')  # 字段名错误 ❌
```

**飞书实际格式：**
```python
# 日期标题在 heading1 (type=3)
block_type = 3  # heading1
{
    "heading1": {
        "elements": [{"text_run": {"content": "3月15日收录"}}]
    }
}

# 文章链接在空 text block
block_type = 2  # text
{
    "text": {
        "elements": [{
            "mention_doc": {
                "token": "xxx",  # 注意：是 token 不是 obj_token！
                "title": "文章标题"
            }
        }]
    }
}
```

#### 2. 静默失败

解析返回 0 个日期时，脚本只是打印 `[INFO] 暂无新文章` 然后正常退出，没有告警。

#### 3. 数据覆盖风险

解析失败后继续执行，会覆盖 `index_map.json`，可能导致历史数据丢失。

### 修复方案

#### 解析逻辑修复
```python
# 支持多种 block 类型
def get_block_text(block):
    block_type = block.get('block_type')
    if block_type == 2:
        return ''.join(e.get('text_run', '').get('content', '') 
                      for e in block.get('text', {}).get('elements', []))
    elif block_type == 3:
        return ''.join(e.get('text_run', '').get('content', '') 
                      for e in block.get('heading1', {}).get('elements', []))
    # ... 同理支持 type 4, 5

# 只要匹配 X月Y日，不限定"收录"
match = re.search(r'(\d+)月(\d+)日', text)

# 正确的字段名
token = elem.get('mention_doc', {}).get('token')  # ✅
```

#### 监控保护
```python
def check_parse_health(date_count, today):
    if date_count == 0:
        print('[ALERT] 解析到 0 个日期！', file=sys.stderr)
        return False
    
    # 与历史平均比较
    if date_count < avg_count * 0.5:
        print('[ALERT] 解析数量异常偏低', file=sys.stderr)
        return False
    
    return True

# 使用
if not check_parse_health(len(new_map), today):
    sys.exit(1)  # 异常时不覆盖数据
```

### 经验总结

1. **不要假设 block_type**：飞书可能改版，日期可能在 heading 里
2. **不要假设字段名**：API 不同接口字段名可能不一致
3. **不要假设格式**："3月15日" 不一定有 "收录" 后缀
4. **不要静默失败**：解析异常必须告警并退出
5. **保护已有数据**：异常时不覆盖、不清空

### 监控指标

- 解析日期数 = 0 → 严重告警
- 解析日期数 < 历史平均 × 0.5 → 异常告警
- 今天有更新但新增 = 0 → 检查是否需要重跑

### 相关文件

- `lib/extractor.py` - 核心解析逻辑
- `SKILL.md` - 使用文档
