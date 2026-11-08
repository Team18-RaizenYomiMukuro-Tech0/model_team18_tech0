# DB 管理手順（下書き）

- 対象: 要件 N-09、決定 inputs/キックオフ記録.md #35 8-2。
- 実行者: 担当者が手で行う（承認後）。使うのは運営から**配られたアカウント**で、アプリ用の `giftia_app` では行わない。
- 決定: 運営回答 2026-11-08「DB のアカウント」と追記（`inputs/運営回答_2026-11-08.md`、キックオフ #65・#66・#68・#70）。**管理用アカウントも、アプリ用の `giftia_app` も作らない（案A）**。表の作成（CREATE TABLE）・期間後の表の削除（DROP）・テスト行の削除は、配られたアカウントで手で行う。公開版のアプリも、同じ配られたアカウントでつなぐ。
- 対応: 実装計画 B2、テスト設計 H-17・NF-18・NF-19・NF-09・E-08。
- 状態: **下書き**。DB には接続していない。ここに書いたコマンドは1つも実行していない（実行前に未確認の点が下の「穴」にある）。
- 依拠: 設計.md DATA-02（列）、N-04（権限表）、キックオフ #71（DB 名の固定・SSL は certifi の公開の証明書の束。設計 未決O の案Q。#28 の証明書ファイルは使わない）。

## 0. 共通の準備

接続情報は書かない。シェルの環境変数で渡す。名前は次のとおり（`GIFTIA_DB_*` は設計.md N-04 の案、`GIFTIA_ADMIN_*` はこの手順書での仮置き）。

| 環境変数 | 中身 |
| --- | --- |
| `GIFTIA_DB_HOST` | DB のホスト名 |
| `GIFTIA_ADMIN_USER` | 配られたアカウントのユーザー名（手元で手順を行うときの名前。アプリは `GIFTIA_DB_USER` で同じ値を受ける） |
| `GIFTIA_ADMIN_PASSWORD` | 配られたアカウントのパスワード |

PowerShell で設定する（値は自分で入れる。履歴に残したくなければ `Read-Host -AsSecureString` を使う）:

```powershell
$env:GIFTIA_DB_HOST = "<ホスト名>"
$env:GIFTIA_ADMIN_USER = "<配られたユーザー>"
$env:GIFTIA_ADMIN_PASSWORD = "<配られたパスワード>"
$ca = python -c "import certifi; print(certifi.where())"   # 公開の証明書の束（certifi）の場所
```

DB 名は手作業の手順では `giftia_t501` と直接書く（環境変数にしない。#71-3）。接続は SSL 必須。証明書は certifi の公開の束（`$ca`）で、ホスト名も確かめる（`VERIFY_IDENTITY`）。証明書ファイルは配らない・置かない。以降の SQL は `mysql` コマンドラインで流す。共通の接続コマンド（`MYSQL_PWD` はこのシェルの中だけ）:

```powershell
$env:MYSQL_PWD = $env:GIFTIA_ADMIN_PASSWORD
mysql --host=$env:GIFTIA_DB_HOST --user=$env:GIFTIA_ADMIN_USER --database=giftia_t501 --ssl-mode=VERIFY_IDENTITY --ssl-ca=$ca
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

## 2. アプリ用アカウントは作らない（案A）

**この手順は行わない。** `giftia_app` を作る・権限を付ける SQL は載せない。

- 決定: 「`giftia_app` は作らず、配られたアカウントで公開版をつなぐ形」（#70。運営メンバーのだーあさが了承。#68 でレージが案A を選んだ）。
- 理由: 配られたアカウントには `CREATE USER` と `GRANT OPTION` が無く、`giftia_app` を作れず権限も付けられない（穴4）。運営は元々案A の前提で権限を付与している（#68）。データは授業の架空データで、壊れても問題ない（#68）。ただし、このアカウントで壊せるのは自班の `giftia_t501` だけでなく、ほかの班の `giftia_t502`〜`t506` も含む。だからアプリはコードで接続先を `giftia_t501` に固定し、書き込みを `share_links` への INSERT だけに縛る（#70 の2）。
- 影響: アプリが使うアカウントは、DB 側では `giftia_t501%` に SELECT・INSERT・UPDATE・DELETE・CREATE・DROP などの権限を持つ。N-04 の権限表（既存表 SELECT のみ、`share_links` は SELECT・INSERT のみ）は **DB の権限では守れない**。守るのはアプリのコードの側（SQL を作る部分を `Db` に集め、`SELECT` と `share_links` への `INSERT` だけを書く。設計.md D-12・D-13）。DB の権限で `UPDATE`・`DELETE` を拒否する確かめ（NF-09）は、今の DB ではできない。この扱いの文書化は設計・テスト設計の担当に任せる（この手順書では決めない）。

**配られたアカウントのパスワードを Azure に置く**（公開版をつなぐとき。担当者が手で行う）:

1. Azure の App Service の「環境変数」（アプリの設定）に、次の3つ（ホスト・ユーザー・パスワード）を入れる。値はこの文書・リポジトリ・Issue・チャットに書かない。

   | 名前 | 中身 |
   | --- | --- |
   | `GIFTIA_DB_HOST` | DB のホスト名 |
   | `GIFTIA_DB_USER` | 配られたアカウントのユーザー名 |
   | `GIFTIA_DB_PASSWORD` | 配られたアカウントのパスワード |

   DB 名（`giftia_t501`）はコードの定数、SSL の証明書は certifi の公開の束で、どちらも環境変数に置かない（#71-1・2）。
2. 「保存」して、アプリを再起動する。
3. 確かめ: 公開 URL で候補が表示される（DB につながっている）。`/api` の応答やエラーの文に、ホスト名・ユーザー名・パスワード・証明書のパスが出ていない。リポジトリを検索して、パスワードの値が無い（`git grep` で値の一部を探す。手元で行い、結果に値を貼らない）。
4. 手元の `.env` は `.gitignore` に入っているものだけ使う。コミット前に `git status` で `.env` が出ないことを確かめる。

**漏れたとき**（パスワードをリポジトリ・チャット・画面などに出してしまった、またはそう疑うとき）:

1. すぐ、運営（だーあさなど）に連絡し、**配られたアカウントのパスワードを替えてもらう**。この手順書では替えない（`ALTER USER` の権限・可否が回答に無いため。仕様に書かれていません）。
2. 替わるまでの間、必要なら公開を止める（App Service を停止）。
3. 新しいパスワードを受け取ったら、Azure の環境変数 `GIFTIA_DB_PASSWORD` と手元の `.env` を更新し、再起動する。古い値が残っている場所（履歴・メモ・コミット）を探して消す。コミットに入った場合は、履歴の書き換えが要るかどうかをレージと相談する。
4. 何が・いつ漏れたか、替えた日時を `evidence/db/<YYYY-MM-DD>_漏えい対応.md` に残す（値は書かない）。

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
mysqldump --host=$env:GIFTIA_DB_HOST --user=$env:GIFTIA_ADMIN_USER --ssl-mode=VERIFY_IDENTITY --ssl-ca=$ca --no-tablespaces giftia_t501 share_links > share_links_backup.sql
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


## 5. 12/12 の後片付け（DB 側）

運営回答: 期間は 11/12〜12/12。12/12 に App Service を止め、作ったリソースを削除する。DB 側の片付けは、**アプリを止めた後**に、配られたアカウントで手で行う（承認後に担当者が実行）。`giftia_app` は作らないので、アカウントの削除は無い。

順番:

1. アプリ（App Service）を止める（Azure 側。この手順書の対象外）。
2. 実機確認で作ったリンクが残っていないか確かめる（手順3b。当日中に消してあるはず）。
3. 手順4（`DROP TABLE share_links`）。控えが要るなら先に取る。
4. Azure のアプリの設定（環境変数）は App Service の削除で消える。手元の `.env` から配られたアカウントの値を消す。

**実行後の確かめ方**

```sql
SHOW TABLES;     -- 既存の7つだけ（share_links が無い）
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

1. 手順1の後、配られたアカウントで印なし（`is_test = 0`）の行を1行置く（テスト前からあった本物の行の代わり。架空の値）。

```sql
INSERT INTO share_links (share_id, items, created_at, is_test)
VALUES ('AAAAAAAAAAAAAAAAAAAAAA', JSON_ARRAY(JSON_OBJECT('product_id','G0001','name','テスト','price',1000,'reason','手順書の確認用')), UTC_TIMESTAMP(), 0);
```

2. アプリのテスト（テストのコードが `is_test = 1` の行を作る）を流す。API に `is_test: 1` を含めて送っても 0 のままであること（アプリ側のテスト。`share_links` を SELECT して確かめる）。
3. 手順3を実行する（先に件数と中身の SELECT、そのあと `DELETE … WHERE is_test = 1`）。
4. 確かめ（合格の基準）:
   - 印の付いた行（`is_test = 1`）だけが消え、手順の1で置いた印なしの行は残る。
   - 後片付けの後の `share_links` の件数が、テストを始める前と同じ。
   - （アプリ用アカウントが無いので、DB の権限での拒否の確認（NF-09）はできない。手順2 の影響を参照。）

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

1. **アプリ用アカウントの接続元**: 案A（#70）で閉じた。`giftia_app` を作らないので、`'giftia_app'@'<ホスト指定>'` の指定は要らない。
2. **MySQL のバージョン**: `8.4.9-azure` で JSON 型を使うと決定済み（#54-1）。穴ではなくなった。手順0の `VERSION()` で一致を確かめる。
3. **既存テーブルの実名**: 手順2 をやめたので、表ごとの権限付与は無い。既存の7つは手順A の控えの対象（実行前の `SHOW TABLES` で一致を確かめる）。
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
   - **実行できない手順（案A で不要になった）**: `CREATE USER 'giftia_app'`・`GRANT …`・`DROP USER`。案A（#70）で行わないと決めたので、この穴は閉じた。
   - 影響: 手順2 の「影響」を参照（アプリも同じ強い権限でつなぐ）。
   - 参考: 配られたアカウントは `UPDATE` も持つので、手順3 の `DELETE` の条件（`is_test = 1`）を必ず先に SELECT で確かめる。
5. **Azure の制限**: 配られたアカウントで `CREATE TABLE`・`DROP TABLE` が通るかは、実機で一度確かめる前提（権限の一覧では通るはず）。
