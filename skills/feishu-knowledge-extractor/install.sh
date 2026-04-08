#!/bin/bash
# 快速安装脚本

SKILL_DIR="$HOME/.openclaw/workspace/skills/feishu-knowledge-extractor"
BIN_DIR="$HOME/.local/bin"

echo "=== 飞书知识库提取器安装 ==="

# 创建 bin 目录
mkdir -p "$BIN_DIR"

# 创建软链接
if [ ! -L "$BIN_DIR/feishu-extractor" ]; then
    ln -s "$SKILL_DIR/bin/feishu-extractor" "$BIN_DIR/feishu-extractor"
    echo "✓ 已创建命令链接: feishu-extractor"
else
    echo "✓ 命令已存在"
fi

# 检查 PATH
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
    echo ""
    echo "⚠️  请将以下行添加到 ~/.bashrc 或 ~/.zshrc:"
    echo "export PATH=\"\$HOME/.local/bin:\$PATH\""
fi

echo ""
echo "使用方法:"
echo "  feishu-extractor --rebuild-index    # 重建索引"
echo "  feishu-extractor --incremental      # 增量更新"
echo "  feishu-extractor --date 2026-03-15  # 处理指定日期"
echo ""
echo "安装完成！"
