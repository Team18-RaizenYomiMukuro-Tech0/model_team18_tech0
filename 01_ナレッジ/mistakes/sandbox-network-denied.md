---
title: サンドボックスや証明書のせいで外部通信が失敗する
type: knowledge
origin: internal
tags: [mistake]
created: 2026-11-09
updated: 2026-11-16
---

# サンドボックスや証明書のせいで外部通信が失敗する

- 発生回数: 14（〜2026-11-08 に 4、2026-11-09〜11-15 の収集分で +10）
- 最終発生日: 2026-11-14
- 収集源: claude-bash
- デプロイ系: いいえ

## 症状・実行コマンド

- `api.github.com:443 not in this command's allowed_domains`（`gh pr view`）
- `tls: failed to verify certificate: x509: OSStatus -26276`（`gh pr view/list`、2回）
- `github.com:22: 403 not in this command's allowed_domains`（`git fetch`）
- 今週: `gh pr list/view` の `Post https://api.github.com/graphql …` 失敗が 7 回（2026-11-10〜11-14）、`error connecting to api.github.com` 1 回、`github.com:22: 403 not in this command's allowed_domains` 1 回、ほか 1 回。エラー本文は先頭しか記録されておらず、詳細は要確認。

## 原因

ログから: サンドボックスの許可ドメインに api.github.com / github.com:22 が無い。または証明書検証が失敗している。証明書エラーの根本原因は要確認。

## 直し方 / 再発防止

- 許可ドメインを足して再実行する（承認を取る）。
- ネットが要らない確認（`git log`、ローカル diff）に分ける。
- 証明書エラーが続くときは要確認として人に相談する。
