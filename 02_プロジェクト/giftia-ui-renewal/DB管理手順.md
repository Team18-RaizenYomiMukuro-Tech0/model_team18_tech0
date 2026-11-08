# DB 管理手順（下書き）

- 対象: 要件 N-09、決定 inputs/キックオフ記録.md #35 8-2。
- 実行者: 担当者が手で行う（承認後）。使うのは運営から**配られたアカウント**で、アプリ用の `giftia_app` では行わない。
- 決定: 運営回答 2026-11-08「DB のアカウント」（`inputs/運営回答_2026-11-08.md`、#65・#66）。**配られたアカウントは作らない**。表の作成（CREATE TABLE）・期間後の表の削除（DROP）・テスト行の削除は、配られたアカウントで手で行う。
- 対応: 実装計画 B2、テスト設計 H-17・NF-18・NF-19・NF-09・E-08。
- 状態: **下書き**。DB には接続していない。ここに書いたコマンドは1つも実行していない（実行前に未確認の点が下の「穴」にある）。
- 依拠: 設計.md DATA-02（列）、N-04（権限表）、キックオフ #28（証明書）。

## 0. 共通の準備

接続情報は書かない。シェルの環境変数で渡す。名前は次のとおり（`GIFTIA_DB_*` は設計.md N-04 の案、`GIFTIA_ADMIN_*` はこの手順書での仮置き）。

| 環境変数 | 中身 |
| --- | --- |
| `GIFTIA_DB_HOST` | DB のホスト名 |
| `GIFTIA_DB_NAME` | DB 名（`giftia_t501`） |
| `GIFTIA_ADMIN_USER` | 配られたアカウントのユーザー名 |
| `GIFTIA_ADMIN_PASSWORD` | 配られたアカウントのパスワード |
| `GIFTIA_APP_PASSWORD` | `giftia_app` に付けるパスワード（手順2。ここで作ったものを Azure のアプリ設定に置く。リポジトリ・文書には入れない） |
| `GIFTIA_DB_SSL_CA` | 証明書ファイル。#28 の値は `C:\Users\自分\certs\DigiCertGlobalRootG2.crt.pem` |

PowerShell で設定する（値は自分で入れる。履歴に残したくなければ `Read-Host -AsSecureString` を使う）:

```powershell
$env:GIFTIA_DB_HOST = "<ホスト名>"
$env:GIFTIA_DB_NAME = "giftia_t501"
$env:GIFTIA_ADMIN_USER = "<配られたユーザー>"
$env:GIFTIA_ADMIN_PASSWORD = "<配られたパスワード>"
$env:GIFTIA_APP_PASSWORD = "<長いランダムな文字列。自分で作る>"
$env:GIFTIA_DB_SSL_CA = "C:\Users\自分\certs\DigiCertGlobalRootG2.crt.pem"
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

- 確かめ方: `CURRENT_USER()` が配られたアカウント、`DATABASE()` が `giftia_t501`、`Ssl_cipher` が空でない。
- `VERSION()` は `8.4.9-azure` のはず（#54-1。読み取りで確認済み）。JSON 型を使う。違うバージョンが出たら止まって相談する（5.7 未満なら手順1の `items` を `TEXT` にする）。
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

## 2. アプリ用アカウント `giftia_app` を足し、権限を与える

運営回答: アプリ用に `giftia_app` を足す。既存の表は SELECT、`share_links` は SELECT・INSERT。UPDATE・DELETE は付けない。`users` は SELECT も付けない（#58-9）。

**`<ホスト指定>` は仕様に書かれていません**（運営回答にもありません）。決まるまで空欄のまま。

**パスワードの扱い**: `giftia_app` のパスワードは Azure のアプリの設定（環境変数）に置く（名前は `GIFTIA_DB_PASSWORD`、ユーザー名は `GIFTIA_DB_USER` ＝ `giftia_app`）。リポジトリ・文書・Issue には入れない。手元の `.env` は `.gitignore` に入っているものだけ使う。

**アカウントを作る**（権限を与える前に1回）:

```powershell
$env:MYSQL_PWD = $env:GIFTIA_ADMIN_PASSWORD
mysql --host=$env:GIFTIA_DB_HOST --user=$env:GIFTIA_ADMIN_USER --database=$env:GIFTIA_DB_NAME --ssl-mode=VERIFY_IDENTITY --ssl-ca=$env:GIFTIA_DB_SSL_CA -e "CREATE USER 'giftia_app'@'<ホスト指定>' IDENTIFIED BY '$env:GIFTIA_APP_PASSWORD' REQUIRE SSL;"
```

- 実行前の確認: `SELECT user, host FROM mysql.user WHERE user = 'giftia_app';` が空であること（`mysql.user` が読めない場合は `SHOW GRANTS FOR 'giftia_app'@'<ホスト指定>';` がエラーになること）。
- 実行後の確かめ: 同じ SELECT で1行出る。パスワードは画面・履歴に出さない。

設計.md N-04 の権限表のとおり。既存テーブルは `SELECT` だけ、`share_links` は `SELECT`・`INSERT` だけ。

**実行前の確認**

```sql
SHOW GRANTS FOR 'giftia_app'@'<ホスト指定>';
SHOW TABLES;
```

- `giftia_app` が存在すること（上で作った後）。現在の権限をメモしておく（戻すときに使う）。
- `SHOW TABLES` の結果から、既存テーブルの名前を全部控える（#54 の読み取り結果 `backend/db_schema.md`（ブランチ feat/issue-50-db-ssl-verify）の7つのうち `users` を除く6つに与える: order_items・orders・product_facts・product_scenes・products・reviews・users。実行前に `SHOW TABLES` と一致するか確かめる）。

**実行**（`<…>` を埋めてから流す。ユーザーとホストは環境変数ではなく SQL に直接書く）

```sql
-- 既存テーブルごとに1行ずつ（`users` を除く6つ。#58-9）（DB 全体への GRANT SELECT ON giftia_t501.* は `users` にも付くので使わない。
-- N-04 の表どおり、テーブルごとに書く）
GRANT SELECT ON giftia_t501.order_items TO 'giftia_app'@'<ホスト指定>';
GRANT SELECT ON giftia_t501.orders TO 'giftia_app'@'<ホスト指定>';
GRANT SELECT ON giftia_t501.product_facts TO 'giftia_app'@'<ホスト指定>';
GRANT SELECT ON giftia_t501.product_scenes TO 'giftia_app'@'<ホスト指定>';
GRANT SELECT ON giftia_t501.products TO 'giftia_app'@'<ホスト指定>';
GRANT SELECT ON giftia_t501.reviews TO 'giftia_app'@'<ホスト指定>';

GRANT SELECT, INSERT ON giftia_t501.share_links TO 'giftia_app'@'<ホスト指定>';
FLUSH PRIVILEGES;
```

**実行後の確かめ方**

```sql
SHOW GRANTS FOR 'giftia_app'@'<ホスト指定>';
```

- 出力に `INSERT`・`UPDATE`・`DELETE`・`CREATE`・`DROP`・`ALTER`・`INDEX`・`ALL PRIVILEGES`・`GRANT OPTION` が**ない**こと。`share_links` の行は `SELECT, INSERT` だけ。
- 実際の拒否は、アプリ用アカウントで次を流して確かめる（設計.md N-04 の確かめ方）:

```powershell
$env:MYSQL_PWD = "<アプリ用パスワード。このシェルの中だけ>"
mysql --host=$env:GIFTIA_DB_HOST --user=giftia_app --database=$env:GIFTIA_DB_NAME --ssl-mode=VERIFY_IDENTITY --ssl-ca=$env:GIFTIA_DB_SSL_CA -e "DELETE FROM share_links WHERE 1=0; UPDATE share_links SET items=items WHERE 1=0;"
```

- 期待: `DELETE command denied` / `UPDATE command denied` のエラーになる（`WHERE 1=0` なので、通ってしまっても行は消えない）。既存テーブルへの `INSERT`/`UPDATE`/`DELETE` も同様に拒否されること（`WHERE 1=0` を付けて、テーブル名を入れて試す）。

## 3. テスト行だけを消す

N-09:「テスト用の印の付いた行だけ」を配られたアカウントで消す。

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

### 3b. 実機確認で作ったリンクの削除（当日中）

運営回答: 公開後、iPhone（Safari）と Android（Chrome）で共有ページを1回ずつ開く。確かめるために作ったリンクは **ID（`share_id`）を控えておき、確認した当日中に**、配られたアカウントで手で消す。実機から作ったリンクは `is_test = 0` なので、手順3の条件では消えない。`share_id` で指定する。

**実行前の確認**

```sql
SELECT share_id, created_at, is_test FROM share_links WHERE share_id IN ('<控えた ID>', '<控えた ID>');
```

- 控えた ID の件数と一致すること（他の行が混じっていない）。

**実行**

```sql
DELETE FROM share_links WHERE share_id IN ('<控えた ID>', '<控えた ID>');
```

**実行後の確かめ方**

```sql
SELECT COUNT(*) FROM share_links WHERE share_id IN ('<控えた ID>', '<控えた ID>');   -- 0
```

## 4. 元に戻す（DROP TABLE）

N-09: DB は共有リンク用テーブルを消せば元どおり（既存テーブルは変えていない）。**中の行は戻らない**。

**実行前の確認**

```sql
SELECT COUNT(*) FROM share_links;
SHOW TABLES;
```

- 期間（11/12〜12/12）が終わっていること、または戻すと決めたこと（決めた人はレージ）。行が残っていれば、先に控えを取るか、捨ててよいことを確かめる（本物の共有リンクが入っていないか）。
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

- アプリ用アカウントの権限の掃除（任意）: テーブルを消すと、その `share_links` への権限の記録だけ残ることがある。不要なら `REVOKE SELECT, INSERT ON giftia_t501.share_links FROM 'giftia_app'@'<ホスト指定>';`。ただしテーブルが無いと REVOKE が失敗する DB もあるので、失敗しても害はない。

## 5. 12/12 の後片付け（DB 側）

運営回答: 期間は 11/12〜12/12。12/12 に App Service を止め、作ったリソースを削除する。DB 側の片付けは、**アプリを止めた後**に、配られたアカウントで手で行う（承認後に担当者が実行）。

順番:

1. アプリ（App Service）を止める（Azure 側。この手順書の対象外）。
2. 手順4（`DROP TABLE share_links`）。控えが要るなら先に取る。
3. `giftia_app` を削除する（下）。
4. Azure のアプリ設定に置いた `giftia_app` のパスワードは、App Service の削除で消える。手元の `.env` にあるものも消す。

**実行前の確認**

```sql
SHOW GRANTS FOR 'giftia_app'@'<ホスト指定>';
SHOW TABLES LIKE 'share_links';    -- 手順4の後なので空
```

**実行**

```sql
DROP USER 'giftia_app'@'<ホスト指定>';
```

**実行後の確かめ方**

```sql
SHOW GRANTS FOR 'giftia_app'@'<ホスト指定>';   -- エラー（アカウントが無い）
SHOW TABLES;                                    -- 既存の7つだけ
```

- 既存テーブルの定義・件数が、下の「A. 作る前の控え」と同じこと。

## 確かめ（NF-18・NF-19・B2 の完了条件）

手順1〜4を実際に流すとき、次の順で確かめて `evidence/` に残す。DB への書き込みは配られたアカウントの手順1〜4だけで、アプリ用アカウントでは拒否の確認だけを行う。

### A. 作る前の控え（手順1の直前）

既存テーブルの定義と件数を控える（B2 完了条件 3、E-08）。DROP の後（B）と比べるのに使う。

```sql
SELECT table_name, column_name, column_type, is_nullable, column_key
  FROM information_schema.columns WHERE table_schema = DATABASE()
  ORDER BY table_name, ordinal_position;
SELECT table_name, table_rows FROM information_schema.tables
  WHERE table_schema = DATABASE() ORDER BY table_name;
```

`table_rows` は概算なので、各既存テーブルの `SELECT COUNT(*) FROM <既存テーブル>;` も控える。結果はファイルに保存し、手順1の後と手順4の後に同じものを取って比べる。

### B. NF-18 テスト行の印と後片付け

1. 手順1・2の後、配られたアカウントで印なし（`is_test = 0`）の行を1行置く（テスト前からあった本物の行の代わり。架空の値）。

```sql
INSERT INTO share_links (share_id, items, created_at, is_test)
VALUES ('AAAAAAAAAAAAAAAAAAAAAA', JSON_ARRAY(JSON_OBJECT('product_id','G0001','name','テスト','price',1000,'reason','手順書の確認用')), UTC_TIMESTAMP(), 0);
```

2. アプリのテスト（テストのコードが `is_test = 1` の行を作る）を流す。API に `is_test: 1` を含めて送っても 0 のままであること（アプリ側のテスト。`share_links` を SELECT して確かめる）。
3. 手順3を実行する（先に件数と中身の SELECT、そのあと `DELETE … WHERE is_test = 1`）。
4. 確かめ（合格の基準）:
   - 印の付いた行（`is_test = 1`）だけが消え、手順の1で置いた印なしの行は残る。
   - 後片付けの後の `share_links` の件数が、テストを始める前と同じ。
   - アプリ用アカウントでは行を消せない（手順2の拒否の確認。NF-09）。

```sql
SELECT is_test, COUNT(*) FROM share_links GROUP BY is_test;
SELECT share_id FROM share_links WHERE share_id = 'AAAAAAAAAAAAAAAAAAAAAA';   -- 1行残っている
```

5. 手順1の1行は、確かめの後に消す。**`is_test = 0` なので手順3では消えない**。このときだけ主キーを指定して消す: `DELETE FROM share_links WHERE share_id = 'AAAAAAAAAAAAAAAAAAAAAA' AND is_test = 0;`（`WHERE` なしは流さない）。

記録: `evidence/NF-18.md` に、前後の件数、消した条件（`is_test = 1`）を書く（接続情報は書かない）。

### C. NF-19 戻し方

1. アプリを前のコミットに戻して入れ直し、S-01 が通ること（アプリ側。公開中は先に公開を止める）。
2. 手順4の前に A と同じ控えを取り、手順4（`DROP TABLE share_links`）の後にもう一度取る。
3. 合格の基準: 既存テーブルの列・件数が、A の控えと前後で同じ。`SHOW TABLES LIKE 'share_links'` が空。
4. 確認後に必要なら手順1からテーブルを作り直す。

記録: `evidence/NF-19.md`（①の結果、②の比べた結果）。

## 実行の記録

実行したら `evidence/db/<YYYY-MM-DD>_<手順番号>.md` を作る（例 `evidence/db/2026-11-08_3.md`）。書くこと:

- 置き場所: 手順ごとの記録は `evidence/db/<YYYY-MM-DD>_<手順番号>.md`。確かめの記録は上の `evidence/NF-18.md`・`evidence/NF-19.md`
- 実行者と日時
- 実行したコマンドと出力（ホスト・ユーザー・パスワードは `<伏せ>` に置き換える）
- 実行前の確認の結果、実行後の確かめの結果（件数など）
- 失敗・中止したときはその理由

接続情報・パスワードは記録にも書かない。

## 穴（未確認・決まっていないこと）

1. **アプリ用アカウントのホスト指定**（`'giftia_app'@'<ホスト指定>'` の `<ホスト指定>`）: 仕様に書かれていません。運営回答にもありません。Azure の App Service からの接続元との関係で決まる。決まるまで空欄。
2. **MySQL のバージョン**: `8.4.9-azure` で JSON 型を使うと決定済み（#54-1）。穴ではなくなった。手順0の `VERSION()` で一致を確かめる。
3. **既存テーブルの実名**: 7つあるうち、`users` を除く6つに SELECT を与える（#58-9。ログインの答えが来たら見直す）。実行前の `SHOW TABLES` で一致を確かめる。
4. **配られたアカウントの権限**（2026-11-08、`SHOW GRANTS FOR CURRENT_USER;` だけを実行して確認。ユーザー名・ホストは伏せる）:

   | 権限 | 対象 | あるか |
   | --- | --- | --- |
   | `SELECT` `INSERT` `UPDATE` `DELETE` | `giftia_t501%` の全表（`.*`） | ある |
   | `CREATE` `DROP` | 同上 | ある |
   | `INDEX` `ALTER` `REFERENCES` `CREATE TEMPORARY TABLES` `LOCK TABLES` `CREATE VIEW` `SHOW VIEW` | 同上 | ある |
   | `CREATE USER` | 全体（`*.*`） | **ない**（全体の権限は `USAGE` だけ） |
   | `GRANT OPTION` | どの対象にも | **ない** |

   - 対象は DB 名のパターン `giftia_t501%`（ほかに同じ形のパターンが5つ、`t502`〜`t506`）。`giftia_t501` はこのパターンに入る。
   - **実行できる手順**: 手順1（`CREATE TABLE`）、手順3・3b（`DELETE`）、手順4（`DROP TABLE`）、手順B のテスト行の `INSERT`、手順0 の接続確認。
   - **実行できない手順**: 手順2 の `CREATE USER 'giftia_app'` と `GRANT …`（`CREATE USER` と `GRANT OPTION` が無い）、手順5 の `DROP USER`（`CREATE USER` 権限が要る）。
   - 影響: `giftia_app` を配られたアカウントでは作れず、権限も与えられない。運営が `giftia_app` を作る、または `CREATE USER` と `GRANT OPTION` を付ける必要がある。どちらにするかは運営回答に書かれていません（運営への確認事項）。確認が取れるまで、手順2・5 は実行しない。
   - 参考: 配られたアカウントは `UPDATE` も持つので、手順3 の `DELETE` の条件（`is_test = 1`）を必ず先に SELECT で確かめる。
5. **Azure の制限**: `FLUSH PRIVILEGES` や `REQUIRE SSL` の可否は、実機で一度確かめる前提。
