---
title: サンドボックスや証明書のせいで外部通信が失敗する
type: knowledge
origin: internal
tags: [mistake]
created: 2026-11-09
updated: 2026-11-26
---

# サンドボックスや証明書のせいで外部通信が失敗する

- 発生回数: 16（〜2026-11-08 に 4、2026-11-09〜11-15 の収集分で +10、2026-11-16〜11-22 の収集分で +1、2026-11-26 の収集分で +1）
- 最終発生日: 2026-11-24
- 収集源: claude-bash
- デプロイ系: いいえ

## 症状・実行コマンド

- `api.github.com:443 not in this command's allowed_domains`（`gh pr view`）
- `tls: failed to verify certificate: x509: OSStatus -26276`（`gh pr view/list`、2回）
- `github.com:22: 403 not in this command's allowed_domains`（`git fetch`）
- 今週: `gh pr list/view` の `Post https://api.github.com/graphql …` 失敗が 7 回（2026-11-10〜11-14）、`error connecting to api.github.com` 1 回、`github.com:22: 403 not in this command's allowed_domains` 1 回、ほか 1 回。エラー本文は先頭しか記録されておらず、詳細は要確認。
- 2026-11-23 の要約（1件）: `backend/.venv/bin/python …/scratchpad/alter_1d.py`（DB 管理手順 1d の変更）→ `pymysql.err.OperationalError: (2003, "Can't connect to MySQL server on '<Azure MySQL のホスト>' (timed out)")`。GitHub ではなく Azure の DB への接続。

- 2026-11-26 の要約（1件。2026-11-24）: `gh pr view 715 --json headRefOid,mergeable …; gh pr checks 715 …; git fetch -q origin work/render-test-design && git diff --stat …` → 最初の `gh pr view` は成功（`MERGEABLE`）。続く `gh pr checks` が `error connecting to api.github.com`、`git fetch` が `ssh: connect to host github.com port 22: Undefined error: 0`（`Exit code 128`）。同じ 1 コマンドの中で、途中から GitHub に繋がらなくなった。

## 原因

ログから: サンドボックスの許可ドメインに api.github.com / github.com:22 が無い。または証明書検証が失敗している。証明書エラーの根本原因は要確認。2026-11-23 の DB 接続のタイムアウトは、サンドボックスの許可ドメインに DB のホストが無い（`.claude/settings.json` の許可は `github.com`・`api.github.com` だけ）か、Azure 側のファイアウォールで今の IP が許されていないかのどちらか（要確認）。2026-11-26 の要約の 1 件（11-24）は、`allowed_domains` の拒否文言が無く、同じコマンドの前半の GitHub への問い合わせは通っている。許可の問題でなく、回線の一時的な断の可能性がある（要確認。[[github-transient-5xx]] と同じく、待って打ち直す側）。

## 直し方 / 再発防止

- 許可ドメインを足して再実行する（承認を取る）。
- ネットが要らない確認（`git log`、ローカル diff）に分ける。
- 証明書エラーが続くときは要確認として人に相談する。
- DB に触るスクリプトは、本番の変更の前に接続だけを確かめる 1 行（`SELECT 1`）を先に流す。タイムアウトしたら、サンドボックスか Azure のファイアウォールかを PM に確かめてもらう（Azure の操作は PM が手で行う）。
- 1 コマンドに GitHub への問い合わせを何個もつなぐと、途中で切れたとき、どこまで通ったか分かりにくい。`&&` でつなぎ、通ったものを先に表示してから次へ進める（推定）。
