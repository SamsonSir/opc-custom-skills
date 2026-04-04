#!/bin/bash
# CDP 环境检查脚本 - OpenClaw 适配版

echo "🔍 检查 Web Access CDP 环境..."
echo ""

# 检查 Node.js 版本
echo "1. 检查 Node.js..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v | cut -d'v' -f2)
    MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1)
    if [ "$MAJOR" -ge 22 ]; then
        echo "   ✅ Node.js $NODE_VERSION (原生 WebSocket 支持)"
    else
        echo "   ⚠️  Node.js $NODE_VERSION (建议升级到 22+ 以获得原生 WebSocket 支持)"
        echo "      如需使用当前版本，请安装 ws 模块: npm install -g ws"
    fi
else
    echo "   ❌ Node.js 未安装"
    exit 1
fi

# 检查 Chrome 调试端口
echo ""
echo "2. 检查 Chrome 调试端口..."
CHROME_PORT=${CHROME_DEBUG_PORT:-9222}
if nc -z 127.0.0.1 $CHROME_PORT 2>/dev/null || curl -s http://127.0.0.1:$CHROME_PORT/json &>/dev/null; then
    echo "   ✅ Chrome 调试端口 $CHROME_PORT 可用"
else
    echo "   ❌ Chrome 调试端口 $CHROME_PORT 未响应"
    echo ""
    echo "   请按以下方式启动 Chrome："
    echo "   google-chrome --remote-debugging-port=$CHROME_PORT"
    echo ""
    echo "   或在 Chrome 地址栏打开："
    echo "   chrome://inspect/#remote-debugging"
    echo "   勾选 'Allow remote debugging for this browser instance'"
    exit 1
fi

# 检查 CDP Proxy
echo ""
echo "3. 检查 CDP Proxy..."
PROXY_PORT=${CDP_PROXY_PORT:-3456}
if curl -s http://127.0.0.1:$PROXY_PORT/health &>/dev/null; then
    echo "   ✅ CDP Proxy 已运行 (端口 $PROXY_PORT)"
else
    echo "   ⚠️  CDP Proxy 未运行"
    echo "      启动命令: node ~/.openclaw/workspace/skills/web-access/scripts/cdp-proxy.mjs &"
fi

echo ""
echo "🎉 环境检查完成！"
