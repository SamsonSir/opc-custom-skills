#!/bin/bash
# 短剧对话 TTS 批量生成脚本
# 用法: ./generate-dialogue.sh <对话脚本文件> [输出目录]

set -e

SCRIPT_FILE="${1:-}"
OUTPUT_DIR="${2:-./output}"
VOICE_MALE="Nofish"
VOICE_FEMALE="Bella"
LOG_FILE="/tmp/drama-tts.log"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 日志函数
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[错误]${NC} $1" | tee -a "$LOG_FILE"
}

success() {
    echo -e "${GREEN}[成功]${NC} $1" | tee -a "$LOG_FILE"
}

warn() {
    echo -e "${YELLOW}[警告]${NC} $1" | tee -a "$LOG_FILE"
}

# 检查依赖
check_deps() {
    if [ -z "$ELEVENLABS_API_KEY" ]; then
        error "未设置 ELEVENLABS_API_KEY 环境变量"
        echo "请先在 openclaw.json 中配置: messages.tts.elevenlabs.apiKey"
        exit 1
    fi
    
    if ! command -v ffmpeg &> /dev/null; then
        error "未安装 ffmpeg，请安装: apt-get install ffmpeg"
        exit 1
    fi
}

# 解析脚本文件
parse_script() {
    local file="$1"
    local line_num=0
    local seq=1
    
    while IFS= read -r line || [ -n "$line" ]; do
        ((line_num++))
        
        # 跳过空行和注释
        [[ -z "$line" || "$line" =~ ^[[:space:]]*$ ]] && continue
        [[ "$line" =~ ^# ]] && continue
        
        # 解析角色和台词
        local role=""
        local emotion=""
        local text=""
        
        if [[ "$line" =~ ^(男|M):[[:space:]]*(\[([^\]]+)\])?[[:space:]]*(.+)$ ]]; then
            role="male"
            emotion="${BASH_REMATCH[3]:-}"
            text="${BASH_REMATCH[4]}"
        elif [[ "$line" =~ ^(女|F):[[:space:]]*(\[([^\]]+)\])?[[:space:]]*(.+)$ ]]; then
            role="female"
            emotion="${BASH_REMATCH[3]:-}"
            text="${BASH_REMATCH[4]}"
        else
            warn "第 $line_num 行格式无法识别，已跳过: $line"
            continue
        fi
        
        # 生成音频
        generate_audio "$seq" "$role" "$emotion" "$text"
        ((seq++))
        
    done < "$file"
    
    success "共生成 $((seq-1)) 个音频片段"
}

# 生成单个音频
generate_audio() {
    local seq="$1"
    local role="$2"
    local emotion="$3"
    local text="$4"
    
    local voice_id
    local prefix
    local emotion_tag
    
    if [ "$role" = "male" ]; then
        voice_id="$VOICE_MALE"
        prefix="male"
        emotion_tag="${emotion:-冷酷}"
    else
        voice_id="$VOICE_FEMALE"
        prefix="female"
        emotion_tag="${emotion:-温柔}"
    fi
    
    local seq_str=$(printf "%03d" "$seq")
    local output_file="$OUTPUT_DIR/${seq_str}-${prefix}-${emotion_tag}.mp3"
    
    # 构建带情感标签的文本
    local final_text="$text"
    if [ -n "$emotion" ]; then
        final_text="[$emotion] $text [pause]"
    else
        final_text="$text [pause]"
    fi
    
    log "生成 [$seq] $prefix | 情感: ${emotion:-无} | 文本: ${text:0:30}..."
    
    # 调用 ElevenLabs API
    local request_body=$(cat <<EOF
{
    "text": $(echo "$final_text" | jq -R .),
    "model_id": "eleven_v3",
    "voice_settings": {
        "stability": 0.4,
        "similarity_boost": 0.75,
        "style": 0.3,
        "use_speaker_boost": true,
        "speed": 0.95
    }
}
EOF
)
    
    if curl -s -X POST "https://api.elevenlabs.io/v1/text-to-speech/${voice_id}" \
        -H "Content-Type: application/json" \
        -H "xi-api-key: ${ELEVENLABS_API_KEY}" \
        -d "$request_body" \
        --output "$output_file" 2>> "$LOG_FILE"; then
        
        local file_size=$(stat -c%s "$output_file" 2>/dev/null || echo "0")
        if [ "$file_size" -gt 1000 ]; then
            success "[$seq] 已保存: $output_file (${file_size} bytes)"
        else
            error "[$seq] 文件过小，可能生成失败"
            return 1
        fi
    else
        error "[$seq] API 调用失败"
        return 1
    fi
    
    # 小延迟避免触发限流
    sleep 0.5
}

# 合并所有音频
merge_audio() {
    local concat_file="$OUTPUT_DIR/concat_list.txt"
    
    log "准备合并音频..."
    
    # 创建合并列表
    find "$OUTPUT_DIR" -name "*.mp3" -type f ! -name "final.mp3" | sort > "$concat_file"
    
    if [ ! -s "$concat_file" ]; then
        warn "没有可合并的音频文件"
        return
    fi
    
    # 使用 ffmpeg 合并
    local final_output="$OUTPUT_DIR/final-merged.mp3"
    
    if ffmpeg -y -f concat -safe 0 -i "$concat_file" -acodec copy "$final_output" 2>> "$LOG_FILE"; then
        success "合并完成: $final_output"
    else
        error "合并失败，请查看日志: $LOG_FILE"
    fi
    
    rm -f "$concat_file"
}

# 主函数
main() {
    echo "🎭 短剧对话 TTS 生成器"
    echo "======================"
    
    # 参数检查
    if [ -z "$SCRIPT_FILE" ]; then
        echo "用法: $0 <对话脚本文件> [输出目录]"
        echo ""
        echo "示例:"
        echo "  $0 dialogue.txt ./output"
        echo ""
        echo "脚本格式:"
        echo "  男: [cold] 这是男声台词"
        echo "  女: [sad] 这是女声台词"
        exit 1
    fi
    
    if [ ! -f "$SCRIPT_FILE" ]; then
        error "脚本文件不存在: $SCRIPT_FILE"
        exit 1
    fi
    
    # 创建输出目录
    mkdir -p "$OUTPUT_DIR"
    
    # 检查依赖
    check_deps
    
    log "开始处理: $SCRIPT_FILE"
    log "输出目录: $OUTPUT_DIR"
    
    # 解析并生成
    parse_script "$SCRIPT_FILE"
    
    # 询问是否合并
    echo ""
    read -p "是否合并所有音频片段为一个文件？(y/n): " merge_choice
    if [[ "$merge_choice" =~ ^[Yy]$ ]]; then
        merge_audio
    fi
    
    success "全部完成！输出目录: $OUTPUT_DIR"
}

# 运行主函数
main
