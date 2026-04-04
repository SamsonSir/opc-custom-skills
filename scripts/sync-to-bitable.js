#!/usr/bin/env node
/**
 * 同步 OPC 自定义技能到飞书多维表格
 * 
 * 使用方式:
 * node sync-custom-skills-to-bitable.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 配置
const APP_TOKEN = 'QqKbbaGvvah8CgsMSWzcHZcMn1c';
const TABLE_ID = 'tblEmZH6jYBZKWH9';
const SKILLS_DIR = path.join(__dirname, '..', 'skills');

// 获取技能列表
function getCustomSkills() {
    const skills = [];
    const skillDirs = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);
    
    for (const skillName of skillDirs) {
        const skillPath = path.join(SKILLS_DIR, skillName);
        const skillMdPath = path.join(skillPath, 'SKILL.md');
        const readmePath = path.join(skillPath, 'README.md');
        
        // 尝试读取 SKILL.md 或 README.md
        let description = '';
        let contentFile = null;
        
        if (fs.existsSync(skillMdPath)) {
            contentFile = skillMdPath;
        } else if (fs.existsSync(readmePath)) {
            contentFile = readmePath;
        }
        
        if (contentFile) {
            const content = fs.readFileSync(contentFile, 'utf8');
            // 提取描述：查找 ## Description 或第一个段落
            const lines = content.split('\n');
            let inDescription = false;
            
            for (const line of lines) {
                // 检查是否是 Description 部分
                if (line.match(/^##?\s*(Description|描述|简介)/i)) {
                    inDescription = true;
                    continue;
                }
                
                // 如果在描述部分，提取非空行
                if (inDescription && line.trim() && !line.startsWith('#')) {
                    description = line.trim().substring(0, 300);
                    break;
                }
                
                // 如果没有 Description 部分，找第一个长段落
                if (!inDescription && line.trim().length > 20 && !line.startsWith('#') && !line.startsWith('>')) {
                    description = line.trim().substring(0, 300);
                    // 继续找更好的描述
                    if (description.length > 50) break;
                }
            }
        }
        
        // 确定分类
        const category = getCategory(skillName, description);
        const tags = getTags(skillName, description);
        
        skills.push({
            name: skillName,
            description: description || `${skillName} - OPC自定义技能`,
            category,
            tags,
            path: skillPath
        });
    }
    
    return skills;
}

// 获取分类
function getCategory(name, desc) {
    const nameLower = name.toLowerCase();
    const descLower = desc.toLowerCase();
    
    if (nameLower.includes('1688') || nameLower.includes('xianyu')) return '电商运营';
    if (nameLower.includes('xhs') || nameLower.includes('xiaohongshu')) return '小红书运营';
    if (nameLower.includes('video')) return '内容创作';
    if (nameLower.includes('wechat') || nameLower.includes('weixin')) return '微信运营';
    if (nameLower.includes('ocr') || nameLower.includes('tts') || nameLower.includes('image') || nameLower.includes('seedream')) return '内容创作';
    if (nameLower.includes('auto') || nameLower.includes('workflow') || nameLower.includes('clawflow')) return '自动化工具';
    if (nameLower.includes('github') || nameLower.includes('cli') || nameLower.includes('qmd')) return '开发工具';
    if (nameLower.includes('search') || nameLower.includes('memory') || nameLower.includes('proactive')) return 'AI助手';
    if (nameLower.includes('backup')) return '系统管理';
    if (nameLower.includes('feishu')) return '飞书生态';
    if (nameLower.includes('frontend') || nameLower.includes('design')) return '设计创作';
    if (nameLower.includes('web-access') || nameLower.includes('agent-reach')) return '浏览器自动化';
    
    return '其他';
}

// 获取标签
function getTags(name, desc) {
    const tags = [];
    const nameLower = name.toLowerCase();
    const descLower = desc.toLowerCase();
    
    if (nameLower.includes('1688')) tags.push('1688', '电商');
    if (nameLower.includes('xhs') || nameLower.includes('xiaohongshu')) tags.push('小红书', '社交媒体');
    if (nameLower.includes('xianyu')) tags.push('闲鱼', '电商');
    if (nameLower.includes('wechat')) tags.push('微信', '公众号');
    if (nameLower.includes('video')) tags.push('视频', '剪辑');
    if (nameLower.includes('ocr')) tags.push('OCR', '文字识别');
    if (nameLower.includes('tts')) tags.push('TTS', '语音合成');
    if (nameLower.includes('image') || nameLower.includes('seedream')) tags.push('AI绘画', '图像生成');
    if (nameLower.includes('auto')) tags.push('自动化');
    if (nameLower.includes('github')) tags.push('GitHub', '开发');
    if (nameLower.includes('search')) tags.push('搜索');
    if (nameLower.includes('feishu')) tags.push('飞书');
    if (nameLower.includes('web-access') || nameLower.includes('browser')) tags.push('浏览器', '爬虫');
    if (tags.length === 0) tags.push('OPC原创');
    
    return [...new Set(tags)].slice(0, 5);
}

// 生成 JSON 输出（供 feishu_bitable 工具使用）
function generateSyncData() {
    const skills = getCustomSkills();
    const today = Date.now();
    
    const records = skills.map(skill => ({
        fields: {
            "Skill名称": skill.name,
            "来源平台": "GitHub",
            "分类": skill.category,
            "描述": skill.description,
            "星级": "⭐⭐⭐⭐⭐",
            "状态": "OPC原创",
            "发现日期": today,
            "标签": skill.tags,
            "备注": "自定义技能，位于 opc-custom-skills 仓库"
        }
    }));
    
    return {
        action: "batch_create",
        app_token: APP_TOKEN,
        table_id: TABLE_ID,
        records: records
    };
}

// 主函数
function main() {
    console.log('🦞 OPC 自定义技能同步工具\n');
    
    const skills = getCustomSkills();
    console.log(`发现 ${skills.length} 个自定义技能:\n`);
    
    skills.forEach((skill, index) => {
        console.log(`${index + 1}. ${skill.name}`);
        console.log(`   分类: ${skill.category}`);
        console.log(`   标签: ${skill.tags.join(', ')}`);
        console.log(`   描述: ${skill.description.substring(0, 100)}...`);
        console.log();
    });
    
    // 输出生成的数据
    const syncData = generateSyncData();
    console.log('\n📋 同步数据已生成，请使用 feishu_bitable_app_table_record 工具写入表格：\n');
    console.log(JSON.stringify(syncData, null, 2));
}

main();