#!/bin/bash
# Web Access Skill 初始化脚本
# 一键初始化所有配置

echo "🚀 Web Access Skill 初始化"
echo "============================"

# 1. 初始化 Profile 管理器目录
echo ""
echo "1️⃣ 初始化 Profile 管理器..."
~/.openclaw/workspace/scripts/chrome-profile-manager.sh init

# 2. 创建必要的目录
echo ""
echo "2️⃣ 创建目录结构..."
mkdir -p ~/.openclaw/workspace/chrome-profiles/backups
echo "   ✅ chrome-profiles/ 目录已就绪"

# 3. 检查依赖
echo ""
echo "3️⃣ 检查依赖..."
if command -v /opt/google/chrome/chrome &> /dev/null; then
    echo "   ✅ Chrome 已安装"
else
    echo "   ❌ Chrome 未找到"
fi

if command -v screen &> /dev/null; then
    echo "   ✅ screen 已安装"
else
    echo "   ⚠️  screen 未安装 (用于后台运行 Chrome)"
fi

# 4. 显示可用命令
echo ""
echo "============================"
echo "✅ 初始化完成！"
echo ""
echo "📋 可用命令:"
echo ""
echo "  # 启动平台 Chrome (带登录态)"
echo "  ~/.openclaw/workspace/scripts/chrome-profile-manager.sh start xiaohongshu"
echo ""
echo "  # 查看所有平台状态"
echo "  ~/.openclaw/workspace/scripts/chrome-profile-manager.sh status"
echo ""
echo "  # 启动所有平台"
echo "  ~/.openclaw/workspace/scripts/chrome-profile-manager.sh start-all"
echo ""
echo "  # 使用 browser 工具操作"
echo "  browser action:open url:https://www.xiaohongshu.com"
echo ""
echo "============================"
