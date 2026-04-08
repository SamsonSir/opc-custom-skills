#!/bin/bash
# 快速生成单句短剧台词
# 用法: ./quick-line.sh <角色> <文本> [情感标签]

ROLE="$1"
TEXT="$2"
EMOTION="${3:-}"

if [ -z "$ROLE" ] || [ -z "$TEXT" ]; then
    echo "用法: $0 <男|女> <台词> [情感标签]"
    echo ""
    echo "示例:"
    echo "  $0 男 \"你逃不出我的手掌心\" confident"
    echo "  $0 女 \"我...我害怕\" nervous"
    exit 1
fi

# 设置音色
if [ "$ROLE" = "男" ] || [ "$ROLE" = "male" ] || [ "$ROLE" = "M" ]; then
    VOICE="Nofish"
    ROLE_NAME="男声"
else
    VOICE="Bella"
    ROLE_NAME="女声"
fi

# 构建文本
if [ -n "$EMOTION" ]; then
    FINAL_TEXT="[$EMOTION] $TEXT [pause]"
    echo "🎭 生成 $ROLE_NAME | 情感: $EMOTION"
else
    FINAL_TEXT="$TEXT [pause]"
    echo "🎭 生成 $ROLE_NAME"
fi

echo "📝 台词: $TEXT"
echo ""

# 使用 tts 工具生成
openclaw tts text="$FINAL_TEXT" voice="$VOICE"
