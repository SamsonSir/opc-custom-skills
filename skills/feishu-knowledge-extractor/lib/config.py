"""配置加载"""
import os
from pathlib import Path


def load_config(config_path='.env'):
    """从环境变量或 .env 文件加载配置"""
    config = {}
    
    # 先尝试加载 .env 文件
    env_file = Path(config_path)
    if env_file.exists():
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                if '=' in line:
                    key, value = line.split('=', 1)
                    config[key.strip()] = value.strip().strip('"\'')
    
    # 环境变量覆盖
    env_mappings = {
        'FEISHU_APP_ID': 'app_id',
        'FEISHU_APP_SECRET': 'app_secret',
        'INDEX_DOC_TOKEN': 'index_doc_token',
        'KIMI_API_KEY': 'kimi_api_key',
        'ANTHROPIC_API_KEY': 'anthropic_api_key',
        'ANTHROPIC_BASE_URL': 'anthropic_base_url',
        'AI_MODEL': 'ai_model',
    }
    
    for env_key, config_key in env_mappings.items():
        if os.getenv(env_key):
            config[config_key] = os.getenv(env_key)
    
    # 设置默认值
    config.setdefault('index_doc_token', 'XjxvwwCZ7ijJMxkJ3SucrVEUn4p')
    config.setdefault('data_dir', 'data')
    config.setdefault('daily_dir', 'daily')
    config.setdefault('topics_dir', 'topics')
    config.setdefault('ai_base_url', 'https://api.kimi.com/coding/')
    config.setdefault('ai_model', 'k2p5')
    
    return config
