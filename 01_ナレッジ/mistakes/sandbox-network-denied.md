---
title: サンドボックスや証明書のせいで外部通信が失敗する
type: knowledge
origin: internal
tags: [mistake]
created: 2026-11-09
updated: 2026-11-23
---

# サンドボックスや証明書のせいで外部通信が失敗する

- 発生回数: 15（〜2026-11-08 に 4、2026-11-09〜11-15 の収集分で +10、2026-11-16〜11-22 の収集分で +1）
- 最終発生日: 2026-11-18
- 収集源: claude-bash
- デプロイ系: いいえ

## 症状・実行コマンド

- `api.github.com:443 not in this command's allowed_domains`（`gh pr view`）
- `tls: failed to verify certificate: x509: OSStatus -26276`（`gh pr view/list`、2回）
- `github.com:22: 403 not in this command's allowed_domains`（`git fetch`）
- 今週: `gh pr list/view` の `Post https://api.github.com/graphql …` 失敗が 7 回（2026-11-10〜11-14）、`error connecting to api.github.com` 1 回、`github.com:22: 403 not in this command's allowed_domains` 1 回、ほか 1 回。エラー本文は先頭しか記録されておらず、詳細は要確認。
- 2026-11-23 の要約（1件）: `backend/.venv/bin/python …/scratchpad/alter_1d.py`（DB 管理手順 1d の変更）→ `pymysql.err.OperationalError: (2003, "Can't connect to MySQL server on '<Azure MySQL のホスト>' (timed out)")`。GitHub ではなく Azure の DB への接続。

## 原因

ログから: サンドボックスの許可ドメインに api.github.com / github.com:22 が無い。または証明書検証が失敗している。証明書エラーの根本原因は要確認。2026-11-23 の DB 接続のタイムアウトは、サンドボックスの許可ドメインに DB のホストが無い（`.claude/settings.json` の許可は `github.com`・`api.github.com` だけ）か、Azure 側のファイアウォールで今の IP が許されていないかのどちらか（要確認）。

## 直し方 / 再発防止

- 許可ドメインを足して再実行する（承認を取る）。
- ネットが要らない確認（`git log`、ローカル diff）に分ける。
- 証明書エラーが続くときは要確認として人に相談する。
- DB に触るスクリプトは、本番の変更の前に接続だけを確かめる 1 行（`SELECT 1`）を先に流す。タイムアウトしたら、サンドボックスか Azure のファイアウォールかを PM に確かめてもらう（Azure の操作は PM が手で行う）。
