# 1688选品助手 - References

## 输出格式说明

### JSON结构

```json
{
  "metadata": {
    "keyword": "搜索关键词",
    "search_time": "ISO格式时间",
    "total_results": 采集数量,
    "sort_by": "排序方式",
    "source": "1688.com"
  },
  "products": [
    {
      "title": "商品标题",
      "price": 单价,
      "price_range": "价格区间",
      "sales_volume": 销量,
      "store_name": "店铺名称",
      "store_rating": 店铺评分,
      "store_years": 开店年限,
      "location": "产地",
      "url": "商品链接",
      "image_url": "主图链接"
    }
  ]
}
```

## 1688搜索参数

| 参数 | 值 | 说明 |
|------|-----|------|
| sortType | va_sales_30 | 30天销量排序 |
| sortType | price_asc | 价格从低到高 |
| sortType | price_desc | 价格从高到低 |
| priceStart | 数字 | 价格下限 |
| priceEnd | 数字 | 价格上限 |

## CDP选择器参考

```javascript
// 商品列表项
'.offer-item' 或 '.sm-offer-item'

// 商品标题
'.offer-title' 或 '.title'

// 价格
'.price' 或 '.number'

// 销量
'.sale' 或 '.booked'

// 店铺名
'.company-name' 或 '.supplier'
```
