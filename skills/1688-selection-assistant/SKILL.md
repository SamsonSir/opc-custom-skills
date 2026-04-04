---
name: 1688-selection-assistant
description: "1688选品助手 - 在1688搜索货源、采集价格、销量和店铺评分等数据，结果保存到本地。支持按销量/价格排序，可设置价格范围过滤。"
metadata:
  openclaw:
    requires:
      bins:
        - python3
        - google-chrome
      skills:
        - agent-browser
    emoji: "🏭"
    homepage: https://github.com/openclaw/1688-selection-assistant
    author: "虾折腾"
    version: "1.0.0"
---

# 1688选品助手 / 1688 Product Selection Assistant

## 概述

在1688搜索货源、采集价格、销量和店铺评分等数据，结果保存到本地项目路径。

**核心能力**：
- 🔍 1688网站自动搜索
- 📊 采集商品价格、销量、店铺评分
- 🏪 店铺信息提取
- 💾 数据本地保存（JSON格式）
- 📈 支持按销量/价格排序
- 💰 支持价格范围过滤

---

## 约束条件 (Constraints)

| 约束 | 说明 |
|------|------|
| **每次搜索必须重新执行** | 无论工作空间是否有历史数据，每次用户搜索请求必须重新执行搜索脚本以获取最新数据 |
| **禁止手动构造搜索URL** | 必须使用 cli.py 执行搜索，不能手动构造URL |
| **禁止复用历史数据** | 用户发起搜索请求时，无论之前是否搜索过相同关键词，必须重新执行搜索脚本 |
| **默认按销量排序** | 当用户说"找产品/选品/搜索产品/热销XX"时，默认使用 `-sort sale` 按销量排序 |
| **数据保存路径** | 数据必须保存到项目路径下的 `data/1688/` 目录 |

---

## 核心工作流程 (Core Workflow)

### Step 1: 准备环境

#### 1.1 启动浏览器

使用 agent-browser 启动 Chrome 并访问1688：

```python
use_browser(action="navigate", url="https://www.1688.com")
```

获取返回的 wsUrl 地址，例如：`ws://127.0.0.1:9222/xx`

解析 HOST 和 PORT：
- HOST = 127.0.0.1
- PORT = 9222

#### 1.2 确保输出目录存在

```bash
mkdir -p "${PROJECT_ROOT}/data/1688"
```

---

### Step 2: 执行搜索脚本

#### 2.1 基础搜索命令

```bash
cd ~/.openclaw/workspace/skills/1688-selection-assistant

python3 scripts/cli.py \
    --host 127.0.0.1 \
    --port 9222 \
    search \
    -k "关键词" \
    --sort sale \
    -l 20
```

#### 2.2 完整参数说明

| 参数 | 简写 | 说明 | 示例 |
|------|------|------|------|
| `--host` | - | Chrome CDP Host | `127.0.0.1` |
| `--port` | - | Chrome CDP Port | `9222` |
| `--keyword` | `-k` | 搜索关键词 | `"抱娃神器"` |
| `--sort` | - | 排序方式 | `sale`(销量)/`price_asc`(价格升)/`price_desc`(价格降) |
| `--limit` | `-l` | 采集数量 | `20` |
| `--price-start` | - | 价格下限 | `10` |
| `--price-end` | - | 价格上限 | `50` |

#### 2.3 输出文件

结果自动保存到：
```
data/1688/{关键词}_{时间戳}.json
```

例如：`data/1688/抱娃神器_20260402_153000.json`

---

### Step 3: 验证和展示数据

#### 3.1 确认文件生成

检查输出文件是否存在且包含有效数据。

#### 3.2 提取关键信息

从JSON中提取展示给用户：
- 商品标题
- 价格
- 销量
- 店铺名称

---

### Step 4: 交付结果

告知用户数据保存路径，并询问是否需要：
- 转换为其他格式（如 CSV）
- 进行进一步分析

---

### Step 5: 关闭浏览器

任务完成后关闭浏览器：

```python
use_browser(action="close")
```

---

## 使用示例

### 示例1：基础搜索（按销量排序）

```bash
python3 scripts/cli.py \
    --host 127.0.0.1 \
    --port 9222 \
    search \
    -k "婴儿背带" \
    --sort sale \
    -l 20
```

### 示例2：价格范围过滤

```bash
python3 scripts/cli.py \
    --host 127.0.0.1 \
    --port 9222 \
    search \
    -k "抱娃神器" \
    --sort price_asc \
    --price-start 20 \
    --price-end 80 \
    -l 15
```

### 示例3：Python调用

```python
from skills import alibaba_1688_assistant

result = alibaba_1688_assistant.search(
    keyword="依倍纳抱娃神器",
    sort="sale",
    limit=20,
    price_start=10,
    price_end=50
)

# result 包含：
# - output_file: 保存路径
# - data: 商品列表
```

---

## 输出数据结构

### JSON格式

```json
{
  "metadata": {
    "keyword": "抱娃神器",
    "search_time": "2026-04-02T15:30:00",
    "total_results": 20,
    "sort_by": "sale"
  },
  "products": [
    {
      "title": "婴儿背带抱娃神器...",
      "price": 35.00,
      "price_range": "30-40",
      "sales_volume": 5000,
      "store_name": "XX母婴用品厂",
      "store_rating": 4.8,
      "store_years": 5,
      "location": "浙江金华",
      "url": "https://detail.1688.com/offer/xxxxx.html",
      "image_url": "https://..."
    }
  ]
}
```

---

## 错误处理

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| Chrome未启动 | 浏览器未启动 | 通过 use_browser 启动并获取CDP地址 |
| Chrome连接失败 | HOST/PORT错误 | 检查从WebSocket地址解析的HOST和PORT是否正确 |
| 搜索返回空 | 关键词无结果或Chrome异常 | 尝试不同关键词；确认Chrome正常运行 |
| 搜索中断/报错 | 临时数据清理 | 关闭浏览器重新启动；临时文件无需手动清理 |

---

## 依赖

### 必需
- Python 3.10+
- Google Chrome
- agent-browser 技能

### Python库
- requests
- beautifulsoup4
- lxml

---

## 安装

```bash
# 进入技能目录
cd ~/.openclaw/workspace/skills/1688-selection-assistant

# 安装依赖
pip install -r requirements.txt

# 验证安装
python3 scripts/cli.py --help
```

---

## 集成到选品SOP

在我们的**抖店选品SOP**中，此技能用于**Phase 4: 供应链评估**：

```
Phase 3: 爆品深度分析
    ↓ 确定选品（如依倍纳抱娃神器）
Phase 4: 供应链评估
    ↓ 调用 1688选品助手
    ↓ 自动搜索货源
    ↓ 采集20个厂家数据
    ↓ 自动保存到 data/1688/
    ↓ 解析并写入飞书厂家信息表
Phase 5: 决策与上架
```

---

**编制：** 虾折腾（OpenClaw AI Agent）  
**版本：** 1.0.0  
**日期：** 2026-04-02
