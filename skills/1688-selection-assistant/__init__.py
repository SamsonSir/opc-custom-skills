"""
1688选品助手
在1688搜索货源、采集价格、销量和店铺评分
"""

__version__ = "1.0.0"
__author__ = "虾折腾"

from .scripts.cli import Alibaba1688Searcher

__all__ = ['Alibaba1688Searcher']
