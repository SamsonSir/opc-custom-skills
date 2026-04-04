---
domain: multi-platform-profiles
aliases: [chrome-profiles, 登录托管, 多平台管理]
updated: 2026-03-23
---

## 平台 Profile 配置

所有平台 Chrome Profile 由 `chrome-profile-manager.sh` 统一管理。

### 目录结构

```
~/.openclaw/workspace/chrome-profiles/
├── xiaohongshu/          # 小红书 Profile
├── douyin/               # 抖音 Profile
├── oceanengine/          # 巨量引擎 Profile
├── doudian/              # 抖店 Profile
├── taobao/               # 淘宝 Profile
├── jd/                   # 京东 Profile
└── backups/              # 备份目录
    ├── xiaohongshu/
    ├── douyin/
    └── ...
```

### 端口分配

| 平台 | 调试端口 | Profile 目录 |
|------|---------|-------------|
| 小红书 | 9222 | chrome-profiles/xiaohongshu/ |
| 抖音 | 9223 | chrome-profiles/douyin/ |
| 巨量引擎 | 9224 | chrome-profiles/oceanengine/ |
| 抖店 | 9225 | chrome-profiles/doudian/ |
| 淘宝 | 9226 | chrome-profiles/taobao/ |
| 京东 | 9227 | chrome-profiles/jd/ |

### 使用方式

```bash
# 初始化
~/.openclaw/workspace/scripts/chrome-profile-manager.sh init

# 启动指定平台
~/.openclaw/workspace/scripts/chrome-profile-manager.sh start xiaohongshu

# 查看状态
~/.openclaw/workspace/scripts/chrome-profile-manager.sh status

# 启动所有平台
~/.openclaw/workspace/scripts/chrome-profile-manager.sh start-all
```

### 与 CDP Proxy 配合

启动平台后，通过对应端口连接：

```bash
# 小红书 (端口 9222)
export CHROME_DEBUG_PORT=9222
node ~/.openclaw/workspace/skills/web-access/scripts/cdp-proxy.mjs &

# 或使用 curl 直接调用 CDP
curl http://127.0.0.1:9222/json/list
```

### 登录态保持

- 每个 Profile 独立存储 cookies、localStorage
- 登录一次后，下次启动自动保持登录
- 定期备份防止数据丢失

### 备份策略

```bash
# 手动备份
chrome-profile-manager.sh backup xiaohongshu

# 自动清理旧备份
chrome-profile-manager.sh cleanup 7  # 保留7天
```
