---
title: gh の使い方違い・ラベル不在・ブランチ保護でマージできない
type: knowledge
origin: internal
tags: [mistake]
created: 2026-11-09
updated: 2026-11-16
---

# gh の使い方違い・ラベル不在・ブランチ保護でマージできない

- 発生回数: 8（〜2026-11-08 に 3、2026-11-09〜11-15 の収集分で +5）
- 最終発生日: 2026-11-14
- 収集源: claude-bash
- デプロイ系: いいえ

## 症状・実行コマンド

- `gh pr merge 35 --squash` → `base branch policy prohibits the merge`
- `gh issue create --label task` → `could not add label: 'task' not found`
- `gh pr view 147 --comments --json comments` → `specify only one of --comments or --json`
- 今週: `gh issue view 206 --comments --json` で同じ指定違い 1 回。`gh pr checks 262/264/267` が終了コード 8（チェックが未完了・保留中。出力は正常）4 回。

## 原因

main の保護で通常マージできない。存在しないラベル名を指定した。`--comments` と `--json` は同時に指定できない。

## 直し方 / 再発防止

- マージ前に必須チェックとレビューを確認する。`--admin` は PM の一言がある場合のみ（[[エージェント運用の決まり]]）。
- ラベルは `gh label list` で確認する。
- コメントは `--json comments` だけを使う。
- `gh pr checks` の終了コード 8 は「保留中あり」。待つなら `--watch` か、終了コードでなく出力を見て判定する（推定。要確認）。
