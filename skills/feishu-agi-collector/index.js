#!/usr/bin/env node

/**
 * 飞书AGI知识库采集器
 * 按照架构师级知识萃取协议处理2026年1月份内容
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const WORKSPACE = path.join(process.env.HOME, '.openclaw/workspace/01-AI-Knowledge-Vault/01-Feishu-AGI');
const CHECKPOINT_FILE = path.join(WORKSPACE, 'processed_tokens.json');
const DAILY_DIR = path.join(WORKSPACE, 'daily');

// 读取断点
function loadCheckpoint() {
  if (!fs.existsSync(CHECKPOINT_FILE)) {
    console.error('❌ 断点文件不存在:', CHECKPOINT_FILE);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
}

// 保存断点
function saveCheckpoint(data) {
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(data, null, 2));
}

// 主逻辑
async function main() {
  console.log('🚀 启动飞书AGI知识库采集器');
  
  const checkpoint = loadCheckpoint();
  const { processed_dates, current_batch } = checkpoint;
  
  // 检查是否完成
  const completed = processed_dates['2026-01'].completed.length;
  const total = processed_dates['2026-01'].total;
  
  console.log(`📊 当前进度: ${completed}/${total}`);
  
  if (completed >= total) {
    console.log('✅ 1月份采集已完成,停止Cron任务');
    
    // 移除Cron任务
    try {
      execSync('openclaw cron remove agi-vault-sync', { stdio: 'inherit' });
      console.log('🛑 Cron任务已移除');
    } catch (err) {
      console.log('⚠️  Cron任务移除失败或已不存在');
    }
    
    process.exit(0);
  }
  
  // 获取下一个待处理日期
  const nextDate = current_batch.next_date;
  console.log(`📝 处理日期: ${nextDate}`);
  
  // 这里应该调用AI进行内容生成
  // 由于需要AI能力,实际处理逻辑在主会话中完成
  console.log('⏸️  实际内容生成由主会话完成');
  console.log('💡 Skill仅负责监控和状态管理');
  
  process.exit(0);
}

main().catch(err => {
  console.error('❌ 执行失败:', err);
  process.exit(1);
});
