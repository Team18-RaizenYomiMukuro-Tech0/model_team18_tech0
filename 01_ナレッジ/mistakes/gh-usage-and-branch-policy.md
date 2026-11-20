---
title: gh の使い方違い・ラベル不在・ブランチ保護でマージできない
type: knowledge
origin: internal
tags: [mistake]
created: 2026-11-09
updated: 2026-11-20
---

# gh の使い方違い・ラベル不在・ブランチ保護でマージできない

- 発生回数: 10（〜2026-11-08 に 3、2026-11-09〜11-15 の収集分で +5、2026-11-20 に +2）
- 最終発生日: 2026-11-20
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

## 2026-11-20 追記：PM の「マージ」の答えがあっても、りじちょーの `gh pr merge --admin` が自動の審査で拒否される

- 症状: `gh pr merge 543 --squash --admin`（IMPLEMENTATION_PLAN の PR）と `gh pr merge 547 --squash --admin`（`evidence/` だけの PR）が、Claude Code の auto mode の審査に「Destructive or Unwanted Actions」で拒否された。#543 は PM が【重要】の質問で「マージ」と答えた後、#547 は 11/19 夜の「評価中も evidence だけの PR はマージしてよい」の決まりに沿ったものだった。
- 原因: 審査は、その時の会話で PM がその PR のマージをはっきり指示したかを見る。前の日の一般的な許可や、別の質問への答えは数えられない（推定）。
- 直し方: 回避はしない（別の道具や API で同じことをしない）。PM に PR 番号を並べて「手でマージしてください」と頼む。マージの順と、待つ PR（担当のコミット待ちなど）も添える。
- 仕組み化しない理由: 許可の設定（`gh pr merge` を常に許す規則）を足すと、本番に反映される PR まで AI がマージできるようになる。main へのマージは利用者の指示がある時だけ、の決まりと合わない。足すかどうかは PM が決める。
