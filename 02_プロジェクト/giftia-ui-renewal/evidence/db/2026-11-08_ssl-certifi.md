# SSL 案Q の接続確認（certifi の束・ホスト名の確認あり）

- 日時: 2026-11-08
- 実行者: Terao（手元の PC。`backend/.env` の配られたアカウント。#67-2 で許可済み）
- 対象: `giftia_t501` だけ。ほかの班の DB にはつないでいない。書き込みなし。
- 根拠: キックオフ記録 #71-2（案Q）

## 実行したもの

`pymysql.connect(..., database="giftia_t501", ssl={"ca": certifi.where(), "check_hostname": True})` で接続し、次の2文だけを実行した。ホスト・ユーザー・パスワードは `.env` から読み、ここには書かない。

```sql
SELECT 1;
SHOW STATUS LIKE 'Ssl_version';
```

certifi のバージョン: 2026.06.17

## 出力

```
SELECT 1 -> ((1,),)
Ssl_version -> (('Ssl_version', 'TLSv1.3'),)
```

## 結果

つながった。証明書は certifi の公開の束で検証され、ホスト名の確認も有効。SSL は TLSv1.3。案Q は手元で使える。

## 補足

- backend の仮想環境には certifi が入っていない（`requirements.txt` にもない）。今回は同じバージョンの certifi を別の Python から参照して確かめた。アプリで使うときは `requirements.txt` に `certifi` を足す必要がある（設計・実装の担当）。
