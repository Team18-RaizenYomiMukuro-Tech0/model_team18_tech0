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


## R2-4・未決1 の材料（読み取りのみ。値と件数だけ）

取得: 2026-11-07。各5件は product_id の昇順で先頭から。

### 1. products.size・products.description

#### size が空の件数

| 全件 | NULL | 空文字 | 空白のみ（空文字を含む） |
| --- | --- | --- | --- |
| 8000 | 0 | 0 | 0 |

#### products.size（5件）

| product_id | product_name | size |
| --- | --- | --- |
| G0001 | Lino 国産タオルギフトセット | フェイスタオル×2 |
| G0002 | Aroma Nook ボタニカルハンドクリーム 金木犀 | 50g |
| G0003 | Honey Farm Sora 果実たっぷりジャム 2本セット | 140g×2本 |
| G0004 | Linen Kitchen Sora 帆布のエプロン（マスタード） | フリーサイズ（丈80cm） |
| G0005 | Mountain Bean Lab ひとことドリップバッグ「ありがとう」 | 10g×2袋 |

#### products.description（5件）

| product_id | product_name | description |
| --- | --- | --- |
| G0001 | Lino 国産タオルギフトセット | 上質な国産タオルを、やわらかな色合いで2枚セットにしました。吸水性がよく、乾きやすいのが特長です。専用のギフトボックスに入れてお届けします。タグは外しやすい位置に付けています。異動や退職のごあいさつにもお選びいただいています。 |
| G0002 | Aroma Nook ボタニカルハンドクリーム 金木犀 | 植物のオイルを重ねて、手肌をしっとり守るハンドクリームです。ギフトボックス入りでお届けします。爪のまわりにもなじみやすい、やわらかなクリームです。パラベンを使わずにつくっています。定番の贈りものです。 |
| G0003 | Honey Farm Sora 果実たっぷりジャム 2本セット | 果物の形が残るほど、果肉をたっぷり使ったジャムです。朝食の時間が楽しみになる贈りものです。パンやヨーグルトに添えるのがおすすめです。瓶のラベルは季節によって変わります。ご注文時に、のしの表書きをご指定いただけます。  【保存方法】冷蔵不要 |
| G0004 | Linen Kitchen Sora 帆布のエプロン（マスタード） | ポケットがたっぷり付いた、しっかりした生地のエプロンです。洗うほどにやわらかくなります。縫製は国内の工房で行っています。紙の帯を巻いてお届けします。価格のわからない納品書でお届けします。 |
| G0005 | Mountain Bean Lab ひとことドリップバッグ「ありがとう」 | ことばを印刷した袋に、ドリップバッグを入れました。袋の色は数色からお選びいただけます。結婚式のプチギフトにも使われています。名入れのシールもお作りできます。30代・40代の女性や男性へのプレゼントに。送別やお礼の贈りものにもおすすめです。  【保存方法】直射日光を避けて保存してください |

### 2. product_facts.fact の値ごとの件数

| fact | 件数 |
| --- | --- |
| office_orders | 3204 |
| room_temp | 1730 |
| indiv_wrap | 1417 |
| shelf_life_days | 881 |

#### fact ごとの value・source の例（各2件、product_id 昇順）

| fact | product_id | value | source |
| --- | --- | --- | --- |
| office_orders | G0001 | 12 | orders |
| office_orders | G0005 | 1 | orders |
| room_temp | G0003 | 1 | description_rule |
| room_temp | G0005 | 1 | description_rule |
| indiv_wrap | G0007 | 1 | description_rule |
| indiv_wrap | G0011 | 0 | description_rule |
| shelf_life_days | G0006 | 240 | description_rule |
| shelf_life_days | G0007 | 360 | description_rule |

### 3. orders の estimated_scene='送別' と gift_purpose='送別' の重なり

| 区分 | 件数 |
| --- | --- |
| 両方 | 17225 |
| estimated_scene だけ（gift_purpose は送別以外、空を含む） | 11170 |
|   うち gift_purpose が NULL | 6297 |
| gift_purpose だけ（estimated_scene は送別以外） | 3352 |
| gift_purpose が NULL（全注文） | 53821 |
| gift_purpose が空文字（全注文） | 0 |
| 全注文 | 279013 |
