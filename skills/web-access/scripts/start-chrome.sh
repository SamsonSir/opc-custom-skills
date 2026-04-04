#!/bin/bash
# 启动 Chrome 调试模式 - Web Access Skill 配套脚本

CHROME_PORT=${CHROME_DEBUG_PORT:-9222}
PROFILE_DIR="${HOME}/chrome-profile-webaccess"

# 确保 profile 目录存在
mkdir -p "$PROFILE_DIR"

echo "🚀 启动 Chrome 调试模式..."
echo "   端口: $CHROME_PORT"
echo "   Profile: $PROFILE_DIR"
echo ""

# 检查 Chrome 是否已在运行
if curl -s http://127.0.0.1:$CHROME_PORT/json > /dev/null 2>&1; then
    echo "✅ Chrome 调试模式已在运行 (端口 $CHROME_PORT)"
    exit 0
fi

# 启动 Chrome
google-chrome \
    --remote-debugging-port=$CHROME_PORT \
    --user-data-dir="$PROFILE_DIR" \
    --no-first-run \
    --no-default-browser-check \
    "about:blank" &
echo $! > /tmp/chrome-webaccess.pid

# 等待启动
echo "⏳ 等待 Chrome 启动..."
for i in {1..10}; do
    if curl -s http://127.0.0.1:$CHROME_PORT/json > /dev/null 2>&1; then
        echo "✅ Chrome 调试模式已启动！"
        echo ""
        echo "📋 常用操作:"
        echo "   检查状态: bash ~/.openclaw/workspace/skills/web-access/scripts/check-deps.sh"
        echo "   启动 Proxy: node ~/.openclaw/workspace/skills/web-access/scripts/cdp-proxy.mjs &"
        exit 0
    fi
    sleep 1
done

echo "❌ Chrome 启动超时，请检查错误"
