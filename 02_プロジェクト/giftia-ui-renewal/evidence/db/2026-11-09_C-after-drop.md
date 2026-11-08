# DB 手順 C の実行記録

- 日付: 2026-11-09
- 実行者: りじちょー（PM の指示により代行）
- 道具: backend/scripts/db_admin.py（接続先 giftia_t501 固定、certifi＋ホスト名の確認）
- ホスト・ユーザー・パスワードは <伏せ>

```sql
SELECT table_name, column_name, column_type, is_nullable, column_key
  FROM information_schema.columns WHERE table_schema = DATABASE()
  ORDER BY table_name, ordinal_position;
```
| TABLE_NAME | COLUMN_NAME | COLUMN_TYPE | IS_NULLABLE | COLUMN_KEY |
| --- | --- | --- | --- | --- |
| order_items | order_id | varchar(12) | NO | PRI |
| order_items | line_no | int | NO | PRI |
| order_items | product_id | varchar(10) | NO | MUL |
| order_items | quantity | int | NO |  |
| order_items | unit_price | int | NO |  |
| orders | order_id | varchar(12) | NO | PRI |
| orders | user_id | varchar(20) | NO | MUL |
| orders | ordered_at | datetime | NO |  |
| orders | gift_purpose | varchar(20) | YES |  |
| orders | estimated_scene | varchar(20) | NO |  |
| orders | recipient_key | varchar(16) | NO |  |
| orders | ship_to_type | varchar(10) | NO |  |
| orders | total_amount | int | NO |  |
| product_facts | product_id | varchar(10) | NO | PRI |
| product_facts | fact | varchar(30) | NO | PRI |
| product_facts | value | int | NO |  |
| product_facts | source | varchar(30) | NO |  |
| product_scenes | product_id | varchar(10) | NO | PRI |
| product_scenes | scene_tag | varchar(20) | NO | PRI |
| products | product_id | varchar(10) | NO | PRI |
| products | product_name | varchar(100) | NO |  |
| products | category | varchar(30) | NO |  |
| products | price | int | NO |  |
| products | brand | varchar(50) | NO |  |
| products | description | text | NO |  |
| products | size | varchar(100) | YES |  |
| products | delivery_days | int | NO |  |
| products | gift_wrap | tinyint(1) | NO |  |
| products | message_card | tinyint(1) | NO |  |
| products | rating | decimal(2,1) | YES |  |
| products | review_count | int | NO |  |
| products | sales_count | int | NO |  |
| products | stock | int | NO |  |
| products | registered_at | date | NO |  |
| reviews | review_id | varchar(12) | NO | PRI |
| reviews | product_id | varchar(10) | NO | MUL |
| reviews | user_id | varchar(20) | NO | MUL |
| reviews | rating | int | NO |  |
| reviews | comment | text | YES |  |
| reviews | posted_at | date | NO |  |
| users | user_id | varchar(20) | NO | PRI |
| users | age_group | varchar(10) | NO |  |
| users | gender | varchar(10) | NO |  |
| users | registered_at | date | NO |  |

```sql
SELECT table_name, table_rows FROM information_schema.tables
  WHERE table_schema = DATABASE() ORDER BY table_name;
```
| TABLE_NAME | TABLE_ROWS |
| --- | --- |
| order_items | 291118 |
| orders | 277151 |
| product_facts | 7232 |
| product_scenes | 19021 |
| products | 7766 |
| reviews | 25072 |
| users | 100224 |

```sql
SELECT COUNT(*) FROM order_items;
```
| COUNT(*) |
| --- |
| 291640 |

```sql
SELECT COUNT(*) FROM orders;
```
| COUNT(*) |
| --- |
| 279013 |

```sql
SELECT COUNT(*) FROM product_facts;
```
| COUNT(*) |
| --- |
| 7232 |

```sql
SELECT COUNT(*) FROM product_scenes;
```
| COUNT(*) |
| --- |
| 19508 |

```sql
SELECT COUNT(*) FROM products;
```
| COUNT(*) |
| --- |
| 8000 |

```sql
SELECT COUNT(*) FROM reviews;
```
| COUNT(*) |
| --- |
| 24751 |

```sql
SELECT COUNT(*) FROM users;
```
| COUNT(*) |
| --- |
| 100000 |

## 比べた結果（手順A の控え と 今）
- 既存テーブルの列・型: 同じ
- 既存テーブルの件数: 同じ
- share_links: 無い（SHOW TABLES LIKE 'share_links';）
