# DB 管理手順（下書き）

- 対象: 要件 N-09、決定 inputs/キックオフ記録.md #35 8-2。
- 実行者: レージが手で行う。使うのは**管理用アカウント**で、アプリ用アカウントでは行わない。
- 状態: **下書き**。DB には接続していない。ここに書いたコマンドは1つも実行していない（実行前に未確認の点が下の「穴」にある）。
- 依拠: 設計.md DATA-02（列）、N-04（権限表）、キックオフ #28（証明書）。

## 0. 共通の準備

接続情報は書かない。シェルの環境変数で渡す。名前は次のとおり（`GIFTIA_DB_*` は設計.md N-04 の案、`GIFTIA_ADMIN_*` はこの手順書での仮置き）。

| 環境変数 | 中身 |
| --- | --- |
| `GIFTIA_DB_HOST` | DB のホスト名 |
| `GIFTIA_DB_NAME` | DB 名（`giftia_t501`） |
| `GIFTIA_ADMIN_USER` | 管理用アカウントのユーザー名 |
| `GIFTIA_ADMIN_PASSWORD` | 管理用アカウントのパスワード |
| `GIFTIA_DB_USER` | アプリ用アカウントのユーザー名（権限を与える相手） |
| `GIFTIA_DB_SSL_CA` | 証明書ファイル。#28 の値は `C:\Users\rkhv3\certs\DigiCertGlobalRootG2.crt.pem` |

PowerShell で設定する（値は自分で入れる。履歴に残したくなければ `Read-Host -AsSecureString` を使う）:

```powershell
$env:GIFTIA_DB_HOST = "<ホスト名>"
$env:GIFTIA_DB_NAME = "giftia_t501"
$env:GIFTIA_ADMIN_USER = "<管理用ユーザー>"
$env:GIFTIA_ADMIN_PASSWORD = "<管理用パスワード>"
$env:GIFTIA_DB_USER = "<アプリ用ユーザー>"
$env:GIFTIA_DB_SSL_CA = "C:\Users\rkhv3\certs\DigiCertGlobalRootG2.crt.pem"
```

接続は SSL 必須、証明書とホスト名を検証する（`VERIFY_IDENTITY`）。以降の SQL は `mysql` コマンドラインで流す。共通の接続コマンド（`MYSQL_PWD` はこのシェルの中だけ）:

```powershell
$env:MYSQL_PWD = $env:GIFTIA_ADMIN_PASSWORD
mysql --host=$env:GIFTIA_DB_HOST --user=$env:GIFTIA_ADMIN_USER --database=$env:GIFTIA_DB_NAME --ssl-mode=VERIFY_IDENTITY --ssl-ca=$env:GIFTIA_DB_SSL_CA
```

接続確認（これが出なければ先へ進まない）:

```sql
SELECT CURRENT_USER(), DATABASE(), VERSION(), @@have_ssl;
SHOW STATUS LIKE 'Ssl_cipher';
```

- 確かめ方: `CURRENT_USER()` が管理用アカウント、`DATABASE()` が `giftia_t501`、`Ssl_cipher` が空でない。
- `VERSION()` が 5.7 以上なら JSON 型が使える（設計.md 未決 E の答え）。**5.7 未満なら手順1の `items` を `TEXT` にする**。
- 作業が終わったら `Remove-Item Env:MYSQL_PWD, Env:GIFTIA_ADMIN_PASSWORD`。

## 1. `share_links` を作る（CREATE TABLE）

列は設計.md DATA-02 のとおり。既存テーブルは変えない。

**実行前の確認**

```sql
SHOW TABLES LIKE 'share_links';
```

- 空であること（すでにあるなら作らない。中身を見て、レージが判断する）。
- `VERSION()` が 5.7 以上であること（上記）。

**実行**

```sql
CREATE TABLE share_links (
  share_id   CHAR(22) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  items      JSON NOT NULL,
  created_at DATETIME NOT NULL,
  is_test    TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (share_id)
);
```

- 5.7 未満のとき: `items JSON NOT NULL` を `items TEXT NOT NULL` に替える（設計.md DATA-02 の注）。
- `is_test` はテスト行の印（1）。本番の作成では常に0。印を付けるのはテストのコードだけで、手でINSERTするときも付けない（設計.md N-09）。
- 「1件以上」の検査は DB に置かない（設計に書かれていないため）。アプリ側の仕事。

**実行後の確かめ方**

```sql
SHOW CREATE TABLE share_links;
SELECT COUNT(*) FROM share_links;
```

- 列が `share_id`・`items`・`created_at`・`is_test` の4つで、型が上のとおり（`is_test` は `tinyint(1)`、NOT NULL、既定値 0）。`share_id` が主キー、ascii_bin。
- `COUNT(*)` が 0。
- 既存テーブルの一覧が増減していないこと（`SHOW TABLES;` を実行前後で比べる）。

## 2. アプリ用アカウントに権限を与える

設計.md N-04 の権限表のとおり。既存テーブルは `SELECT` だけ、`share_links` は `SELECT`・`INSERT` だけ。

**実行前の確認**

```sql
SHOW GRANTS FOR '<アプリ用ユーザー>'@'<ホスト指定>';
SHOW TABLES;
```

- アプリ用アカウントが存在すること。現在の権限をメモしておく（戻すときに使う）。
- `SHOW TABLES` の結果から、既存テーブルの名前を全部控える（設計.md で列の実名は未決1。実名を確定してから下のテーブル名を埋める）。

**実行**（`<…>` を埋めてから流す。ユーザーとホストは環境変数ではなく SQL に直接書く）

```sql
-- 既存テーブルごとに1行ずつ（DB 全体への GRANT SELECT ON giftia_t501.* は、share_links にも SELECT が付くだけなので使ってもよいが、
-- 後から作るテーブルにも及ぶ。N-04 は「既存テーブル」と書いているので、テーブルごとが表に近い）
GRANT SELECT ON giftia_t501.<既存テーブル1> TO '<アプリ用ユーザー>'@'<ホスト指定>';
GRANT SELECT ON giftia_t501.<既存テーブル2> TO '<アプリ用ユーザー>'@'<ホスト指定>';
-- …既存テーブルの数だけ

GRANT SELECT, INSERT ON giftia_t501.share_links TO '<アプリ用ユーザー>'@'<ホスト指定>';
FLUSH PRIVILEGES;
```

**実行後の確かめ方**

```sql
SHOW GRANTS FOR '<アプリ用ユーザー>'@'<ホスト指定>';
```

- 出力に `INSERT`・`UPDATE`・`DELETE`・`CREATE`・`DROP`・`ALTER`・`INDEX`・`ALL PRIVILEGES`・`GRANT OPTION` が**ない**こと。`share_links` の行は `SELECT, INSERT` だけ。
- 実際の拒否は、アプリ用アカウントで次を流して確かめる（設計.md N-04 の確かめ方）:

```powershell
$env:MYSQL_PWD = "<アプリ用パスワード。このシェルの中だけ>"
mysql --host=$env:GIFTIA_DB_HOST --user=$env:GIFTIA_DB_USER --database=$env:GIFTIA_DB_NAME --ssl-mode=VERIFY_IDENTITY --ssl-ca=$env:GIFTIA_DB_SSL_CA -e "DELETE FROM share_links WHERE 1=0; UPDATE share_links SET items=items WHERE 1=0;"
```

- 期待: `DELETE command denied` / `UPDATE command denied` のエラーになる（`WHERE 1=0` なので、通ってしまっても行は消えない）。既存テーブルへの `INSERT`/`UPDATE`/`DELETE` も同様に拒否されること（`WHERE 1=0` を付けて、テーブル名を入れて試す）。

## 3. テスト行だけを消す

N-09:「テスト用の印の付いた行だけ」を管理用アカウントで消す。

印は列 `is_test`（1 がテスト行）。印の付いた行だけを消し、印のない行（0）は消さない（設計.md N-09）。

**実行前の確認**（消す対象を先に見る。ここで対象と件数を人の目で確かめるのが要）

```sql
SELECT COUNT(*) FROM share_links;
SELECT is_test, COUNT(*) FROM share_links GROUP BY is_test;
SELECT share_id, created_at, LEFT(CAST(items AS CHAR), 120) AS items_head
  FROM share_links WHERE is_test = 1 ORDER BY created_at;
```

- 件数が、今回のテストで作った数と合うこと。多すぎるときは消さない。
- `is_test = 0` の件数は、この手順で変わらないこと（実行後に同じ数）。
- 一覧に、印のない行（本物の共有リンク）が混じっていないこと。

**実行**（`WHERE` のない `DELETE` は絶対に流さない）

```sql
START TRANSACTION;
DELETE FROM share_links WHERE is_test = 1;
SELECT ROW_COUNT();
-- 件数が実行前の確認と合うなら:
COMMIT;
-- 合わないなら:
-- ROLLBACK;
```

**実行後の確かめ方**

```sql
SELECT COUNT(*) FROM share_links WHERE is_test = 1;   -- 0
SELECT is_test, COUNT(*) FROM share_links GROUP BY is_test;  -- 1 の行が無い。0 の件数は実行前と同じ
```

## 4. 元に戻す（DROP TABLE）

N-09: DB は共有リンク用テーブルを消せば元どおり（既存テーブルは変えていない）。**中の行は戻らない**。

**実行前の確認**

```sql
SELECT COUNT(*) FROM share_links;
SHOW TABLES;
```

- 消してよいと、レージ本人が決めたこと。行が残っていれば、先に控えを取るか、捨ててよいことを確かめる（本物の共有リンクが入っていないか）。
- 控えが必要なとき（任意）:

```powershell
$env:MYSQL_PWD = $env:GIFTIA_ADMIN_PASSWORD
mysqldump --host=$env:GIFTIA_DB_HOST --user=$env:GIFTIA_ADMIN_USER --ssl-mode=VERIFY_IDENTITY --ssl-ca=$env:GIFTIA_DB_SSL_CA --no-tablespaces $env:GIFTIA_DB_NAME share_links > share_links_backup.sql
```

  控えのファイルは**コミットしない**（保存先はリポジトリの外にする）。

**実行**

```sql
DROP TABLE share_links;
```

（`IF EXISTS` は付けない。無いときにエラーで気づけるようにする。）

**実行後の確かめ方**

```sql
SHOW TABLES LIKE 'share_links';   -- 空
SHOW TABLES;                      -- 実行前の一覧から share_links が消えただけ
```

- アプリ用アカウントの権限の掃除（任意）: テーブルを消すと、その `share_links` への権限の記録だけ残ることがある。不要なら `REVOKE SELECT, INSERT ON giftia_t501.share_links FROM '<アプリ用ユーザー>'@'<ホスト指定>';`。ただしテーブルが無いと REVOKE が失敗する DB もあるので、失敗しても害はない。

## 実行の記録

実行したら `evidence/db/<YYYY-MM-DD>_<手順番号>.md` を作る（例 `evidence/db/2026-11-08_3.md`）。書くこと:

- 実行者と日時
- 実行したコマンドと出力（ホスト・ユーザー・パスワードは `<伏せ>` に置き換える）
- 実行前の確認の結果、実行後の確かめの結果（件数など）
- 失敗・中止したときはその理由

接続情報・パスワードは記録にも書かない。

## 穴（未確認・決まっていないこと）

1. **管理用アカウント・アプリ用アカウントのホスト指定・Azure の制限**: 運営相談の「相談3: DB のアカウントと権限」の返事待ち。それまで空欄のまま。
2. **MySQL のバージョン**（未決 E）: JSON 型の可否。DB 接続後に手順0の `VERSION()` で分かる。
3. **既存テーブルの実名**（設計.md 未決1）: 手順2の `<既存テーブル…>` が埋まらない。DB 接続後。
