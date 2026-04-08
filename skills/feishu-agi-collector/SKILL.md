# 飞书AGI知识库采集器

## 功能
按照🏗️ 架构师级知识萃取协议,采集并处理WaytoAGI飞书知识库2026年1月份内容。

## 执行逻辑
1. 读取断点文件 `processed_tokens.json`
2. 获取下一个待处理日期
3. 按照高密度协议生成内容
4. 更新断点文件
5. 检查是否完成(31/31),完成则停止Cron

## 使用方式
```bash
# 手动执行
npx claw run feishu-agi-collector

# 定时执行(每3分钟)
openclaw cron add "*/3 * * * *" feishu-agi-collector --label "agi-vault-sync"
```

## 输出位置
- 原始内容: `~/.openclaw/workspace/01-AI-Knowledge-Vault/01-Feishu-AGI/daily/2026-01-XX.md`
- 断点记录: `~/.openclaw/workspace/01-AI-Knowledge-Vault/01-Feishu-AGI/processed_tokens.json`
