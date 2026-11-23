---
title: GitHub 側の一時的なエラー（502）で gh が失敗する
type: knowledge
origin: internal
tags: [mistake]
created: 2026-11-23
updated: 2026-11-23
---

# GitHub 側の一時的なエラー（502）で gh が失敗する

- 発生回数: 1（2026-11-16〜11-22 の収集分。初回要約）
- 最終発生日: 2026-11-16
- 収集源: claude-bash
- デプロイ系: いいえ

## 症状・実行コマンド

- `h=$(gh pr view 382 --json headRefOid -q .headRefOid) && gh pr merge 382 --squash --admin --match-head-commit $h && gh pr view 382 …` → `non-200 OK status code: 502 Bad Gateway`（nginx の HTML）

## 原因

ログから: GitHub の API が 502 を返した。こちらのコマンドの書き違いではない。マージが通ったかどうかは、この記録からは分からない（要確認）。

## 直し方 / 再発防止

- 5xx はしばらく待ってから打ち直す。マージのような書き込みは、打ち直す前に `gh pr view <番号> --json state,mergeCommit` で、もう通っていないかを確かめる（2 回マージしようとしない）。
- `--admin` のマージは PM の一言がある場合のみ（[[gh-usage-and-branch-policy]]・[[エージェント運用の決まり]]）。
