#!/usr/bin/env python3
"""
飞书知识库提取器核心库
包含索引解析和内容处理
"""
import json
import re
import sys
import os
from datetime import datetime
from pathlib import Path
import requests


class FeishuAPI:
    """飞书 API 封装"""
    
    def __init__(self, app_id, app_secret):
        self.app_id = app_id
        self.app_secret = app_secret
        self._token = None
    
    def get_token(self):
        """获取 tenant_access_token"""
        if self._token:
            return self._token
            
        r = requests.post(
            'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
            json={'app_id': self.app_id, 'app_secret': self.app_secret}
        )
        data = r.json()
        if data.get('code') != 0:
            raise Exception(f'获取 token 失败: {data}')
        
        self._token = data['tenant_access_token']
        return self._token
    
    def fetch_all_blocks(self, doc_token):
        """分页拉取文档所有 blocks"""
        blocks = []
        page_token = None
        access_token = self.get_token()
        
        while True:
            params = {'page_size': 500}
            if page_token:
                params['page_token'] = page_token
                
            r = requests.get(
                f'https://open.feishu.cn/open-apis/docx/v1/documents/{doc_token}/blocks',
                headers={'Authorization': f'Bearer {access_token}'},
                params=params
            )
            data = r.json()
            
            if data.get('code') != 0:
                raise Exception(f'拉取 blocks 失败: {data}')
            
            items = data.get('data', {}).get('items', [])
            blocks.extend(items)
            
            if not data.get('data', {}).get('has_more'):
                break
            page_token = data['data'].get('page_token')
        
        return blocks
    
    def get_raw_content(self, doc_token):
        """获取文档原始 Markdown 内容"""
        access_token = self.get_token()
        r = requests.get(
            f'https://open.feishu.cn/open-apis/docx/v1/documents/{doc_token}/raw_content',
            headers={'Authorization': f'Bearer {access_token}'},
            params={'lang': 0}
        )
        data = r.json()
        if data.get('code') != 0:
            return None
        return data['data']['content']


class IndexParser:
    """索引解析器 - 从 Wiki 索引页提取日期-文章映射"""
    
    # 坑点记录：
    # - 日期标题在 heading1 (block_type=3)，不在 text (type=2)
    # - mention_doc 字段是 token，不是 obj_token
    # - 格式是 "3月15日"，不一定要有 "收录"
    
    def __init__(self, config):
        self.api = FeishuAPI(config['app_id'], config['app_secret'])
        self.index_doc_token = config.get('index_doc_token', 'XjxvwwCZ7ijJMxkJ3SucrVEUn4p')
        self.data_dir = Path(config.get('data_dir', 'data'))
        self.data_dir.mkdir(exist_ok=True)
    
    @staticmethod
    def _get_block_text(block):
        """从 block 提取文本，支持多种类型"""
        block_type = block.get('block_type')
        if block_type == 2:
            elements = block.get('text', {}).get('elements', [])
        elif block_type == 3:
            elements = block.get('heading1', {}).get('elements', [])
        elif block_type == 4:
            elements = block.get('heading2', {}).get('elements', [])
        elif block_type == 5:
            elements = block.get('heading3', {}).get('elements', [])
        else:
            return ''
        return ''.join(e.get('text_run', {}).get('content', '') for e in elements)
    
    @staticmethod
    def _get_block_elements(block):
        """获取 block 的所有 elements"""
        block_type = block.get('block_type')
        if block_type == 2:
            return block.get('text', {}).get('elements', [])
        elif block_type == 3:
            return block.get('heading1', {}).get('elements', [])
        elif block_type == 4:
            return block.get('heading2', {}).get('elements', [])
        elif block_type == 5:
            return block.get('heading3', {}).get('elements', [])
        return []
    
    def parse_index_map(self, blocks):
        """从 blocks 解析日期-文章映射"""
        date_map = {}
        current_date = None
        
        for i, block in enumerate(blocks):
            block_type = block.get('block_type')
            text = self._get_block_text(block)
            
            # 只处理 heading 类型作为日期标题
            if block_type in [3, 4, 5] and text:
                match = re.search(r'(\d+)月(\d+)日', text)
                if match:
                    month = match.group(1).zfill(2)
                    day = match.group(2).zfill(2)
                    current_date = f'2026-{month}-{day}'
                    date_map.setdefault(current_date, [])
            
            # 提取 mention_doc（使用 token 字段）
            if current_date:
                elements = self._get_block_elements(block)
                for elem in elements:
                    tok = elem.get('mention_doc', {}).get('token')
                    if tok and tok not in date_map[current_date]:
                        date_map[current_date].append(tok)
        
        return date_map
    
    def rebuild_index(self):
        """重建完整索引"""
        print('[INFO] 拉取索引页 blocks...')
        blocks = self.api.fetch_all_blocks(self.index_doc_token)
        print(f'[INFO] 共 {len(blocks)} 个 blocks')
        
        date_map = self.parse_index_map(blocks)
        print(f'[INFO] 解析到 {len(date_map)} 个日期')
        
        # 保存
        index_file = self.data_dir / 'index_map.json'
        with open(index_file, 'w', encoding='utf-8') as f:
            json.dump(date_map, f, ensure_ascii=False, indent=2)
        print(f'[INFO] 已保存到 {index_file}')
        
        return date_map


class ContentProcessor:
    """内容处理器 - 下载、提纯、分类"""
    
    def __init__(self, config):
        self.api = FeishuAPI(config['app_id'], config['app_secret'])
        self.data_dir = Path(config.get('data_dir', 'data'))
        self.daily_dir = Path(config.get('daily_dir', 'daily'))
        self.topics_dir = Path(config.get('topics_dir', 'topics'))
        self.ai_api_key = config.get('kimi_api_key') or config.get('anthropic_api_key')
        self.ai_base_url = config.get('ai_base_url', 'https://api.kimi.com/coding/')
        self.ai_model = config.get('ai_model', 'k2p5')
    
    def incremental_update(self):
        """增量更新今天的文章"""
        today = datetime.now().strftime('%Y-%m-%d')
        self.process_date(today)
    
    def process_date(self, date):
        """处理指定日期"""
        # 加载索引
        index_file = self.data_dir / 'index_map.json'
        if not index_file.exists():
            raise Exception('index_map.json 不存在，请先执行 --rebuild-index')
        
        with open(index_file) as f:
            index_map = json.load(f)
        
        if date not in index_map:
            print(f'[INFO] {date} 无文章')
            return
        
        tokens = index_map[date]
        print(f'[INFO] {date} 共有 {len(tokens)} 篇文章')
        
        # TODO: 实现文章下载、AI提纯、主题分类
        # 这里调用 generate_daily_report.py 的逻辑
        print(f'[INFO] 处理完成（实际实现需集成现有脚本）')
    
    def process_range(self, start_date, end_date):
        """处理日期范围"""
        from datetime import timedelta
        
        start = datetime.strptime(start_date, '%Y-%m-%d')
        end = datetime.strptime(end_date, '%Y-%m-%d')
        
        current = start
        while current <= end:
            date_str = current.strftime('%Y-%m-%d')
            self.process_date(date_str)
            current += timedelta(days=1)
