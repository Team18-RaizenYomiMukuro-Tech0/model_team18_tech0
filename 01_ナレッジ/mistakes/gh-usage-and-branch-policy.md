---
title: gh の使い方違い・ラベル不在・ブランチ保護でマージできない
type: knowledge
origin: internal
tags: [mistake]
created: 2026-11-09
updated: 2026-11-09
---

# gh の使い方違い・ラベル不在・ブランチ保護でマージできない

- 発生回数: 3（2026-10-26〜2026-11-08 の収集分。初回要約）
- 最終発生日: 2026-11-08
- 収集源: claude-bash
- デプロイ系: いいえ

## 症状・実行コマンド

- `gh pr merge 35 --squash` → `base branch policy prohibits the merge`
- `gh issue create --label task` → `could not add label: 'task' not found`
- `gh pr view 147 --comments --json comments` → `specify only one of --comments or --json`

## 原因

main の保護で通常マージできない。存在しないラベル名を指定した。`--comments` と `--json` は同時に指定できない。

## 直し方 / 再発防止

- マージ前に必須チェックとレビューを確認する。`--admin` は PM の一言がある場合のみ（[[エージェント運用の決まり]]）。
- ラベルは `gh label list` で確認する。
- コメントは `--json comments` だけを使う。
