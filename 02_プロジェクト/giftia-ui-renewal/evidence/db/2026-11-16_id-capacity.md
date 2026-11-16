# ID の桁の見積もり（読み取りのみ）

- 日付: 2026-11-16　依頼: god（work: ID-capacity）。PM（レージ）承認済み（2026-11-16「OK」）
- 接続: `backend/database.py`（giftia_t501 固定）。**SELECT だけ**。書き込み・表の変更・`--force` なし。ホスト・ユーザー・パスワードは <伏せ>
- `users` の表は読んでいない。設計.md の N-04（`users` は SELECT もしない。#58-9・#65）に反し、`db.py` の `check_sql` も止める。`users.user_id` と `users.registered_at` は、`orders.user_id`・`reviews.user_id` で代わりに見た。`users` を読むかは PM の判断（下の「決めてほしい点」）

## 1. 問い合わせ文と結果（そのまま）

### 形 products.product_id

```sql
SELECT LEFT(product_id,1) AS prefix, CHAR_LENGTH(product_id)-1 AS digit_len, SUM(SUBSTRING(product_id,2) REGEXP '^[0-9]+$') AS all_digits, COUNT(*) AS n, MIN(product_id) AS min_id, MAX(product_id) AS max_id, MAX(CAST(SUBSTRING(product_id,2) AS UNSIGNED)) AS max_num, MIN(CAST(SUBSTRING(product_id,2) AS UNSIGNED)) AS min_num, COUNT(DISTINCT product_id) AS distinct_n FROM products GROUP BY LEFT(product_id,1), CHAR_LENGTH(product_id)-1 ORDER BY prefix, digit_len
```

| prefix | digit_len | all_digits | n | min_id | max_id | max_num | min_num | distinct_n |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| G | 4 | 8000 | 8000 | G0001 | G8000 | 8000 | 1 | 8000 |

### 形 orders.order_id

```sql
SELECT LEFT(order_id,1) AS prefix, CHAR_LENGTH(order_id)-1 AS digit_len, SUM(SUBSTRING(order_id,2) REGEXP '^[0-9]+$') AS all_digits, COUNT(*) AS n, MIN(order_id) AS min_id, MAX(order_id) AS max_id, MAX(CAST(SUBSTRING(order_id,2) AS UNSIGNED)) AS max_num, MIN(CAST(SUBSTRING(order_id,2) AS UNSIGNED)) AS min_num, COUNT(DISTINCT order_id) AS distinct_n FROM orders GROUP BY LEFT(order_id,1), CHAR_LENGTH(order_id)-1 ORDER BY prefix, digit_len
```

| prefix | digit_len | all_digits | n | min_id | max_id | max_num | min_num | distinct_n |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| O | 8 | 279013 | 279013 | O00000001 | O00279013 | 279013 | 1 | 279013 |

### 形 order_items.order_id

```sql
SELECT LEFT(order_id,1) AS prefix, CHAR_LENGTH(order_id)-1 AS digit_len, SUM(SUBSTRING(order_id,2) REGEXP '^[0-9]+$') AS all_digits, COUNT(*) AS n, MIN(order_id) AS min_id, MAX(order_id) AS max_id, MAX(CAST(SUBSTRING(order_id,2) AS UNSIGNED)) AS max_num, MIN(CAST(SUBSTRING(order_id,2) AS UNSIGNED)) AS min_num, COUNT(DISTINCT order_id) AS distinct_n FROM order_items GROUP BY LEFT(order_id,1), CHAR_LENGTH(order_id)-1 ORDER BY prefix, digit_len
```

| prefix | digit_len | all_digits | n | min_id | max_id | max_num | min_num | distinct_n |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| O | 8 | 291640 | 291640 | O00000001 | O00279013 | 279013 | 1 | 279013 |

### 形 reviews.review_id

```sql
SELECT LEFT(review_id,1) AS prefix, CHAR_LENGTH(review_id)-1 AS digit_len, SUM(SUBSTRING(review_id,2) REGEXP '^[0-9]+$') AS all_digits, COUNT(*) AS n, MIN(review_id) AS min_id, MAX(review_id) AS max_id, MAX(CAST(SUBSTRING(review_id,2) AS UNSIGNED)) AS max_num, MIN(CAST(SUBSTRING(review_id,2) AS UNSIGNED)) AS min_num, COUNT(DISTINCT review_id) AS distinct_n FROM reviews GROUP BY LEFT(review_id,1), CHAR_LENGTH(review_id)-1 ORDER BY prefix, digit_len
```

| prefix | digit_len | all_digits | n | min_id | max_id | max_num | min_num | distinct_n |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R | 8 | 0 | 24751 | RV0000001 | RV0024751 | 0 | 0 | 24751 |

### 形 orders.user_id

```sql
SELECT LEFT(user_id,1) AS prefix, CHAR_LENGTH(user_id)-1 AS digit_len, SUM(SUBSTRING(user_id,2) REGEXP '^[0-9]+$') AS all_digits, COUNT(*) AS n, MIN(user_id) AS min_id, MAX(user_id) AS max_id, MAX(CAST(SUBSTRING(user_id,2) AS UNSIGNED)) AS max_num, MIN(CAST(SUBSTRING(user_id,2) AS UNSIGNED)) AS min_num, COUNT(DISTINCT user_id) AS distinct_n FROM orders GROUP BY LEFT(user_id,1), CHAR_LENGTH(user_id)-1 ORDER BY prefix, digit_len
```

| prefix | digit_len | all_digits | n | min_id | max_id | max_num | min_num | distinct_n |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| U | 6 | 279000 | 279000 | U000001 | U099994 | 99994 | 1 | 75080 |
| U | 10 | 0 | 13 | U-PERSONA-A | U-PERSONA-E | 0 | 0 | 5 |

### 形 reviews.user_id

```sql
SELECT LEFT(user_id,1) AS prefix, CHAR_LENGTH(user_id)-1 AS digit_len, SUM(SUBSTRING(user_id,2) REGEXP '^[0-9]+$') AS all_digits, COUNT(*) AS n, MIN(user_id) AS min_id, MAX(user_id) AS max_id, MAX(CAST(SUBSTRING(user_id,2) AS UNSIGNED)) AS max_num, MIN(CAST(SUBSTRING(user_id,2) AS UNSIGNED)) AS min_num, COUNT(DISTINCT user_id) AS distinct_n FROM reviews GROUP BY LEFT(user_id,1), CHAR_LENGTH(user_id)-1 ORDER BY prefix, digit_len
```

| prefix | digit_len | all_digits | n | min_id | max_id | max_num | min_num | distinct_n |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| U | 6 | 24751 | 24751 | U000001 | U099988 | 99988 | 1 | 19956 |

### 形 order_items.product_id

```sql
SELECT LEFT(product_id,1) AS prefix, CHAR_LENGTH(product_id)-1 AS digit_len, SUM(SUBSTRING(product_id,2) REGEXP '^[0-9]+$') AS all_digits, COUNT(*) AS n, MIN(product_id) AS min_id, MAX(product_id) AS max_id, MAX(CAST(SUBSTRING(product_id,2) AS UNSIGNED)) AS max_num, MIN(CAST(SUBSTRING(product_id,2) AS UNSIGNED)) AS min_num, COUNT(DISTINCT product_id) AS distinct_n FROM order_items GROUP BY LEFT(product_id,1), CHAR_LENGTH(product_id)-1 ORDER BY prefix, digit_len
```

| prefix | digit_len | all_digits | n | min_id | max_id | max_num | min_num | distinct_n |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| G | 4 | 291640 | 291640 | G0001 | G7907 | 7907 | 1 | 7430 |

### 形 reviews.product_id

```sql
SELECT LEFT(product_id,1) AS prefix, CHAR_LENGTH(product_id)-1 AS digit_len, SUM(SUBSTRING(product_id,2) REGEXP '^[0-9]+$') AS all_digits, COUNT(*) AS n, MIN(product_id) AS min_id, MAX(product_id) AS max_id, MAX(CAST(SUBSTRING(product_id,2) AS UNSIGNED)) AS max_num, MIN(CAST(SUBSTRING(product_id,2) AS UNSIGNED)) AS min_num, COUNT(DISTINCT product_id) AS distinct_n FROM reviews GROUP BY LEFT(product_id,1), CHAR_LENGTH(product_id)-1 ORDER BY prefix, digit_len
```

| prefix | digit_len | all_digits | n | min_id | max_id | max_num | min_num | distinct_n |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| G | 4 | 24751 | 24751 | G0001 | G7891 | 7891 | 1 | 4296 |

### 年ごと products.registered_at

```sql
SELECT YEAR(registered_at) AS y, COUNT(*) AS n, MIN(registered_at) AS first_at, MAX(registered_at) AS last_at FROM products GROUP BY YEAR(registered_at) ORDER BY y
```

| y | n | first_at | last_at |
| --- | --- | --- | --- |
| 2021 | 1308 | 2021-07-01 | 2021-12-31 |
| 2022 | 2421 | 2022-01-01 | 2022-12-31 |
| 2023 | 1770 | 2023-01-01 | 2023-12-31 |
| 2024 | 982 | 2024-01-01 | 2024-12-31 |
| 2025 | 1005 | 2025-01-01 | 2025-12-31 |
| 2026 | 514 | 2026-01-01 | 2026-06-30 |

### 年ごと orders.ordered_at

```sql
SELECT YEAR(ordered_at) AS y, COUNT(*) AS n, MIN(ordered_at) AS first_at, MAX(ordered_at) AS last_at FROM orders GROUP BY YEAR(ordered_at) ORDER BY y
```

| y | n | first_at | last_at |
| --- | --- | --- | --- |
| 2024 | 85399 | 2024-07-01 00:00:14 | 2024-12-31 23:57:37 |
| 2025 | 140366 | 2025-01-01 00:06:35 | 2025-12-31 23:56:42 |
| 2026 | 53248 | 2026-01-01 00:20:05 | 2026-06-30 23:59:23 |

### 年ごと reviews.posted_at

```sql
SELECT YEAR(posted_at) AS y, COUNT(*) AS n, MIN(posted_at) AS first_at, MAX(posted_at) AS last_at FROM reviews GROUP BY YEAR(posted_at) ORDER BY y
```

| y | n | first_at | last_at |
| --- | --- | --- | --- |
| 2024 | 6849 | 2024-07-04 | 2024-12-31 |
| 2025 | 12749 | 2025-01-01 | 2025-12-31 |
| 2026 | 5153 | 2026-01-01 | 2026-06-30 |

### 月ごと products.registered_at（直近 24 か月）

```sql
SELECT LEFT(CAST(registered_at AS CHAR),7) AS ym, COUNT(*) AS n FROM products GROUP BY ym ORDER BY ym DESC LIMIT 24
```

| ym | n |
| --- | --- |
| 2026-06 | 93 |
| 2026-05 | 68 |
| 2026-04 | 71 |
| 2026-03 | 117 |
| 2026-02 | 75 |
| 2026-01 | 90 |
| 2025-12 | 100 |
| 2025-11 | 89 |
| 2025-10 | 96 |
| 2025-09 | 86 |
| 2025-08 | 82 |
| 2025-07 | 83 |
| 2025-06 | 102 |
| 2025-05 | 63 |
| 2025-04 | 85 |
| 2025-03 | 75 |
| 2025-02 | 75 |
| 2025-01 | 69 |
| 2024-12 | 81 |
| 2024-11 | 86 |
| 2024-10 | 80 |
| 2024-09 | 80 |
| 2024-08 | 90 |
| 2024-07 | 79 |

### products の ID 番号と登録日（番号の大きい順 15 件）

```sql
SELECT product_id, registered_at FROM products ORDER BY CAST(SUBSTRING(product_id,2) AS UNSIGNED) DESC LIMIT 15
```

| product_id | registered_at |
| --- | --- |
| G8000 | 2026-06-30 |
| G7999 | 2026-06-30 |
| G7998 | 2026-06-30 |
| G7997 | 2026-06-30 |
| G7996 | 2026-06-29 |
| G7995 | 2026-06-29 |
| G7994 | 2026-06-29 |
| G7993 | 2026-06-29 |
| G7992 | 2026-06-28 |
| G7991 | 2026-06-28 |
| G7990 | 2026-06-28 |
| G7989 | 2026-06-28 |
| G7988 | 2026-06-28 |
| G7987 | 2026-06-27 |
| G7986 | 2026-06-27 |

### products 全体

```sql
SELECT COUNT(*) AS n, MIN(registered_at) AS first_at, MAX(registered_at) AS last_at FROM products
```

| n | first_at | last_at |
| --- | --- | --- |
| 8000 | 2021-07-01 | 2026-06-30 |

### products 登録日ごとの件数（上位 10 日）

```sql
SELECT registered_at, COUNT(*) AS n FROM products GROUP BY registered_at ORDER BY n DESC LIMIT 10
```

| registered_at | n |
| --- | --- |
| 2022-07-03 | 23 |
| 2022-08-25 | 16 |
| 2022-10-28 | 15 |
| 2021-10-06 | 15 |
| 2022-05-03 | 14 |
| 2021-11-12 | 14 |
| 2021-11-04 | 13 |
| 2022-05-01 | 13 |
| 2021-08-09 | 13 |
| 2022-03-11 | 13 |

### products 番号の若い順 5 件と登録日

```sql
SELECT product_id, registered_at FROM products ORDER BY CAST(SUBSTRING(product_id,2) AS UNSIGNED) ASC LIMIT 5
```

| product_id | registered_at |
| --- | --- |
| G0001 | 2021-07-01 |
| G0002 | 2021-07-01 |
| G0003 | 2021-07-01 |
| G0004 | 2021-07-01 |
| G0005 | 2021-07-01 |

### 文字順と数の順が食い違う例（桁数が混ざるか）

```sql
SELECT COUNT(DISTINCT CHAR_LENGTH(product_id)) AS length_kinds FROM products
```

| length_kinds |
| --- |
| 1 |

### orders 月ごと（直近 12 か月）

```sql
SELECT LEFT(CAST(ordered_at AS CHAR),7) AS ym, COUNT(*) AS n FROM orders GROUP BY ym ORDER BY ym DESC LIMIT 12
```

| ym | n |
| --- | --- |
| 2026-06 | 8742 |
| 2026-05 | 9798 |
| 2026-04 | 8228 |
| 2026-03 | 11957 |
| 2026-02 | 7771 |
| 2026-01 | 6752 |
| 2025-12 | 28660 |
| 2025-11 | 11670 |
| 2025-10 | 7307 |
| 2025-09 | 7836 |
| 2025-08 | 7117 |
| 2025-07 | 28170 |

### reviews 月ごと（直近 12 か月）

```sql
SELECT LEFT(CAST(posted_at AS CHAR),7) AS ym, COUNT(*) AS n FROM reviews GROUP BY ym ORDER BY ym DESC LIMIT 12
```

| ym | n |
| --- | --- |
| 2026-06 | 808 |
| 2026-05 | 873 |
| 2026-04 | 870 |
| 2026-03 | 1000 |
| 2026-02 | 668 |
| 2026-01 | 934 |
| 2025-12 | 2558 |
| 2025-11 | 667 |
| 2025-10 | 738 |
| 2025-09 | 669 |
| 2025-08 | 918 |
| 2025-07 | 2319 |

### 列の長さ（varchar の幅）

```sql
SELECT table_name AS t, column_name AS c, column_type AS type FROM information_schema.columns WHERE table_schema = DATABASE() AND column_name IN ('product_id','order_id','review_id','user_id') ORDER BY t, c
```

| t | c | type |
| --- | --- | --- |
| order_items | order_id | varchar(12) |
| order_items | product_id | varchar(10) |
| orders | order_id | varchar(12) |
| orders | user_id | varchar(20) |
| product_facts | product_id | varchar(10) |
| product_scenes | product_id | varchar(10) |
| products | product_id | varchar(10) |
| reviews | product_id | varchar(10) |
| reviews | review_id | varchar(12) |
| reviews | user_id | varchar(20) |
| share_likes | product_id | varchar(10) |
| users | user_id | varchar(20) |

## 2. 見積もり（式と結果）

現在の日付ではなく、**データの最後の日付（products・orders・reviews とも 2026-06-30）** を起点にする。

| ID | 今の最大 | 桁の上限 | 空き | 直近 12 か月の増え方 | 尽きるまで | 式 |
| --- | --- | --- | --- | --- | --- | --- |
| `products.product_id`（G＋4 桁） | G8000（8,000 件。欠番なし） | G9999 | 1,999 | 1,050 件/年（2025-07〜2026-06 の月別 83・82・86・96・89・100・90・75・117・71・68・93 の合計）。直近 24 か月は 2,015 件で月 83.96 件 | 約 22.8〜23.8 か月＝**2028 年 5〜6 月ごろ** | 1,999 ÷ (1,050 ÷ 12) ＝ 22.8 か月、1,999 ÷ 83.96 ＝ 23.8 か月 |
| `orders.order_id`（O＋8 桁） | O00279013（279,013 件。欠番なし） | O99999999 | 99,720,986 | 144,008 件/年 | 約 692 年（**西暦 3300 年代**） | 99,720,986 ÷ 144,008 ＝ 692.5 |
| `reviews.review_id`（RV＋7 桁） | RV0024751（24,751 件。欠番なし） | RV9999999 | 9,975,248 | 13,022 件/年 | 約 766 年 | 9,975,248 ÷ 13,022 ＝ 766 |
| `orders.user_id`（U＋6 桁。参考。`users` は読んでいない） | U099994（買った人 75,080 人。番号は飛び飛び） | U999999 | 900,005 | 増え方は出せない（`users.registered_at` を読んでいない。注文の日付だけでは新規の人が分からない） | 出せない | 現在の最大は上限の約 10%。5 万人/年で増えても 18 年以上 |

- `order_items.order_id` は `orders.order_id` と同じ範囲（O00000001〜O00279013、279,013 種類）。`order_items.product_id`・`reviews.product_id` は G0001〜G7907・G7891（4 桁だけ）。
- 型の幅は余裕がある: `product_id` は varchar(10)＝G＋9 桁まで、`order_id` は varchar(12)、`review_id` も varchar(12)。コードの形式チェック（`PRODUCT_ID_RE`＝`[A-Z][0-9]{1,9}`、`frontend/src/lib/recent.ts` の `ID`）も 9 桁まで通す。**G9999 で止まる決まりはコードにも型にも無い**。止まるのは「並び」だけ（下の 3）。
- 商品の増え方はデータの取り込みの量で、アプリには商品を登録する道が無い（アプリは SELECT だけ。N-04）。2026-06-30 より新しい登録日の商品は DB に無い（今日は 2026-11-16）。上の年数は「今までの 2024-07〜2026-06 の増え方が続けば」の見積もり。
- `products.registered_at` の年ごと: 2021 年 1,308・2022 年 2,421・2023 年 1,770・2024 年 982・2025 年 1,005・2026 年（半年だけ）514。増え方は 2022 年をピークに落ちて、2024 年からは年 1,000 件前後。

## 3. 文字として並べ替え・比べている所と、5 桁の ID が来たときの並び

桁数がそろっているうちは、文字の順と数の順は同じ。5 桁（G10000 以降）が来ると、文字の順は `G10000` ＜ `G1001` ＜ `G2000` ＜ `G9999` になる（数の順なら G1001 ＜ G2000 ＜ G9999 ＜ G10000）。使っている並びは、どれも「同点のときの最後の決め手」だけで、点数・価格・評価などの本来の並びは変わらない。同点の中の並びだけが、数の順とずれる。

| 場所 | 何をしているか | 5 桁が来たとき |
| --- | --- | --- |
| `backend/ranking.py:48` `order_by_score` | `sorted(scores, key=(-点数, pid))`。SP-11 の「同点は商品ID順」 | 同点の中で G10000 が G1001 の前に来る |
| `backend/ranking.py:77` `order_by_sort`（D-43。価格・評価・配送日数の並び） | キーの最後が `pid`（文字の比べ） | 同じ |
| `backend/ranking.py:83` `candidate_pool` | `(-点数, pid)` で並べる | 同じ。上位 N 件の線引きは点数なので、入る・入らないは変わらない |
| `backend/ranking.py:98` `top_by_score_then_count` | `(-点数, -送別回数, pid)` | 同じ |
| `backend/api/product_extras.py:45`（似た商品。SQL の `ORDER BY …, p.product_id`） | MySQL の文字の比べ（照合順序）。D-42 の「商品 ID 順」 | 同じ。LIMIT 3 の境で同点の商品が入れ替わりうる |
| `backend/api/products.py:233` | 並びは上の `ranking.py` の結果の順位（`recommend[pid]`）。`pid` を直接比べない | 上に同じ |
| `frontend` | `product_id` の並べ替え・大小の比べは見つからなかった（`.sort(` は `pagination.ts` のページ番号〔数〕だけ。`recent.ts` の `ID` は形式チェックで 9 桁まで通す） | 影響なし |
| テスト設計 | `テスト設計.md` の「回数が同じなら商品ID順」（T1・T2 など）は P01 などの固定データ | 5 桁の ID を入れたテストは無い |

- 直し方の案（実装はしない）: 並びを数の順にするなら、SQL は `ORDER BY CAST(SUBSTRING(p.product_id, 2) AS UNSIGNED)`、Python は `(len(pid), pid)`（桁が少ない方が先。同じ桁なら文字の順）をキーにする。または、ID を最初から G00001 のように 5 桁以上にそろえる（データの変更になる）。

## 4. 要約（god への報告用）

- 商品の ID は **2028 年 5〜6 月ごろ** に G9999 で尽きる見積もり（空き 1,999、年 1,050 件）。ただしコードと型は 9 桁まで通すので、止まるのではなく、同点の並びが数の順とずれるだけ。アプリは商品を登録しない。
- 注文（O＋8 桁）は約 692 年、レビュー（RV＋7 桁）は約 766 年。尽きない。
- `user_id`（U＋6 桁）は `users` を読んでいないので増え方は出せない（現在の最大 U099994。上限 U999999）。

## 決めてほしい点
- `users` の表を読んで `users.user_id`・`users.registered_at` を出すか。設計の N-04 に反するので、PM が決める。今回は読んでいない。
