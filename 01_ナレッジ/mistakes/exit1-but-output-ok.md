---
title: 出力は正常なのに終了コード 1 で記録される
type: knowledge
origin: internal
tags: [mistake]
created: 2026-11-09
updated: 2026-11-26
---

# 出力は正常なのに終了コード 1 で記録される

- 発生回数: 153（〜2026-11-08 に 32、2026-11-09〜11-15 の収集分で +96、2026-11-16〜11-22 の収集分で +9、Windows 機の収集分で +14、2026-11-26 の収集分で +2）
- 最終発生日: 2026-11-25
- 収集源: claude-bash（Bash フックの失敗記録）
- デプロイ系: いいえ

## 症状・実行コマンド

- `gh pr view`・`git show`・`sed -n`・`cat` などの出力が期待どおり error 欄に入り、先頭だけ `Exit code 1`。

- 今週も `gh pr view`・`git show`・`sed -n`・`grep -n`・`curl`（Azure の応答確認で 200 を返しているのに Exit 28 / 2）が同じ形で多数。
- 2026-11-23 の要約（9件。記録 33 件の約3割で、先週より大きく減った）: `gh pr view … | head`、`for p in python3.13 …; do which $p; done; … command -v uv`（最後の `command -v` が無し）、`for p in .venv/bin/python venv/bin/python; do [ -x $p ] && …`（最後の候補が無い）、`gh pr edit` の後の件数表示が `0`、`[ -n "$f" ] && grep …`（`$f` が空）、`ls …/*/frontend/AGENTS.md 2>/dev/null`（一致なし）、`ls -d .work/tmp`（無いことの確認）、HTML のテキストを表示する `python3`（エラー文なし）、`git show … | grep -n -A3 concurrency`（一致なし＝設定が無いことの確認）。
- 今週の傾向: 「有るか無いかを確かめる」コマンドの最後が `[ -x ]`・`[ -n ]`・`grep`・`ls` で、無い側に当たって 1 になる形が多い。

- 2026-11-23 夜の要約（Windows 機の 14件。2026-11-07〜11-21）: `ls .env* backend/.env*`（ルートに一致なし）、`ls … .sent`（outbox に JSON が無いことの確認）、`for … grep -oE`（一部の行で一致なし）、`gh api … --jq .body`、`git nope`（記録の仕組みを試すための失敗と推定）、`grep -c`（0 件）など。画面確認のスクリプト（Chrome のヘッドレス）4 件と `python -c` 1 件は、エラー文も出力もほぼ無く、何が 1 を返したか要確認。

- 2026-11-26 の要約（2件）:
  - `ls .github/workflows/ && grep -rniE "draft|review|claude|codex|copilot" .github/workflows/*.yml | grep -viE "^\S+:\s*#" | head -60; ls .claude/approvals.yml .claude/classifiers 2>/dev/null`（11-25）→ 一覧も検索結果も出ているのに `Exit code 1`。最後の `ls` で 2 つとも無かった（`2>/dev/null` で文言は消える）ことが 1 の原因と推定。無いことの確認。
  - `grep -n "like" -i … | head -40; sed -n 1,40p …; ls node_modules >/dev/null 2>&1 && echo has_nm`（11-18）→ 出力は正常。末尾の `ls node_modules … && echo` で `node_modules` が無く 1 になった（推定）。

## 原因

ログから: 出力は期待どおりの内容で、エラー文が無い。推定（要確認）: 末尾の grep が一致なし、`&&` 連鎖の途中、パイプ末尾などで終了コードだけ 1 になった。実害のあるミスではなく、記録のノイズの可能性が高い。

## 直し方 / 再発防止

- フック側で「エラー文が無く出力だけある記録」を除外する案（要確認）。
- コマンド側は、意図した非ゼロなら `|| true` で終了コードをそろえる。
- 週1要約では実害のあるミスと分けて見る。
