# 班の DB の構造

テーブル数: 7

## order_items（約 291118 件）

| 列 | 型 | 空を許す | キー | 説明 |
| --- | --- | --- | --- | --- |
| order_id | varchar(12) | NO | PRI |  |
| line_no | int | NO | PRI |  |
| product_id | varchar(10) | NO | MUL |  |
| quantity | int | NO |  |  |
| unit_price | int | NO |  |  |

## orders（約 277151 件）

| 列 | 型 | 空を許す | キー | 説明 |
| --- | --- | --- | --- | --- |
| order_id | varchar(12) | NO | PRI |  |
| user_id | varchar(20) | NO | MUL |  |
| ordered_at | datetime | NO |  |  |
| gift_purpose | varchar(20) | YES |  |  |
| estimated_scene | varchar(20) | NO |  |  |
| recipient_key | varchar(16) | NO |  |  |
| ship_to_type | varchar(10) | NO |  |  |
| total_amount | int | NO |  |  |

## product_facts（約 7232 件）

| 列 | 型 | 空を許す | キー | 説明 |
| --- | --- | --- | --- | --- |
| product_id | varchar(10) | NO | PRI |  |
| fact | varchar(30) | NO | PRI |  |
| value | int | NO |  |  |
| source | varchar(30) | NO |  |  |

## product_scenes（約 19021 件）

| 列 | 型 | 空を許す | キー | 説明 |
| --- | --- | --- | --- | --- |
| product_id | varchar(10) | NO | PRI |  |
| scene_tag | varchar(20) | NO | PRI |  |

## products（約 7766 件）

| 列 | 型 | 空を許す | キー | 説明 |
| --- | --- | --- | --- | --- |
| product_id | varchar(10) | NO | PRI |  |
| product_name | varchar(100) | NO |  |  |
| category | varchar(30) | NO |  |  |
| price | int | NO |  |  |
| brand | varchar(50) | NO |  |  |
| description | text | NO |  |  |
| size | varchar(100) | YES |  |  |
| delivery_days | int | NO |  |  |
| gift_wrap | tinyint(1) | NO |  |  |
| message_card | tinyint(1) | NO |  |  |
| rating | decimal(2,1) | YES |  |  |
| review_count | int | NO |  |  |
| sales_count | int | NO |  |  |
| stock | int | NO |  |  |
| registered_at | date | NO |  |  |

## reviews（約 25072 件）

| 列 | 型 | 空を許す | キー | 説明 |
| --- | --- | --- | --- | --- |
| review_id | varchar(12) | NO | PRI |  |
| product_id | varchar(10) | NO | MUL |  |
| user_id | varchar(20) | NO | MUL |  |
| rating | int | NO |  |  |
| comment | text | YES |  |  |
| posted_at | date | NO |  |  |

## users（約 100224 件）

| 列 | 型 | 空を許す | キー | 説明 |
| --- | --- | --- | --- | --- |
| user_id | varchar(20) | NO | PRI |  |
| age_group | varchar(10) | NO |  |  |
| gender | varchar(10) | NO |  |  |
| registered_at | date | NO |  |  |

## テーブル同士のつながり（外部キー）

- order_items.order_id → orders.order_id
- order_items.product_id → products.product_id
- orders.user_id → users.user_id
- product_facts.product_id → products.product_id
- product_scenes.product_id → products.product_id
- reviews.product_id → products.product_id
- reviews.user_id → users.user_id
