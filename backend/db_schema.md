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

## MySQL のバージョン（未決 E）

- バージョン: 8.4.9-azure
- JSON 型: 使える（5.7 以上）

## 区分の値の一覧（未決 1・2 の材料）

値ごとの件数。50 種類を超える列は先頭 50 件だけ。

### products.category（未決2: 11カテゴリーとの対応の材料）

| 値 | 件数 |
| --- | --- |
| 生活雑貨 | 1965 |
| 食品 | 1908 |
| コスメ | 853 |
| 飲料 | 792 |
| 家電 | 496 |
| インテリア | 464 |
| ビジネス小物 | 420 |
| フラワー | 406 |
| 酒類 | 387 |
| カタログギフト | 309 |

### orders.estimated_scene（未決1: 推定シーン）

| 値 | 件数 |
| --- | --- |
| 毎年決まった相手への贈答 | 83398 |
| 友人への誕生日 | 75362 |
| 家族への誕生日 | 51056 |
| ビジネスのお礼 | 40802 |
| 送別 | 28395 |

### orders.gift_purpose（未決1: 贈る目的）

| 値 | 件数 |
| --- | --- |
| 誕生日 | 72653 |
| （空） | 53821 |
| お歳暮 | 43015 |
| お中元 | 35339 |
| お礼 | 29160 |
| 送別 | 20577 |
| 結婚祝い | 8696 |
| 母の日 | 7028 |
| 出産祝い | 4427 |
| 父の日 | 4297 |

### orders.ship_to_type（未決1: 送り先（会社宛てかの見分け方））

| 値 | 件数 |
| --- | --- |
| 自宅 | 246631 |
| 会社 | 32382 |

### product_scenes.scene_tag（未決1: 商品とシーンの結びつき）

| 値 | 件数 |
| --- | --- |
| 誕生日 | 4649 |
| 送別 | 3746 |
| お礼 | 3290 |
| 母の日 | 1819 |
| お歳暮 | 1746 |
| お中元 | 1581 |
| 結婚祝い | 1178 |
| 父の日 | 987 |
| 出産祝い | 512 |

