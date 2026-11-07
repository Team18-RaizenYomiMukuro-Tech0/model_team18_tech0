# 班の DB のメモ（手で書く）

`check_db.py` はこのファイルを書き換えません。`db_schema.md` は `check_db.py` を動かすたびに作り直されるので、手で調べた結果はこちらに書いてください。

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
