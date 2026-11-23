---
title: 出力は正常なのに終了コード 1 で記録される
type: knowledge
origin: internal
tags: [mistake]
created: 2026-11-09
updated: 2026-11-23
---

# 出力は正常なのに終了コード 1 で記録される

- 発生回数: 137（〜2026-11-08 に 32、2026-11-09〜11-15 の収集分で +96、2026-11-16〜11-22 の収集分で +9）
- 最終発生日: 2026-11-21
- 収集源: claude-bash（Bash フックの失敗記録）
- デプロイ系: いいえ

## 症状・実行コマンド

- `gh pr view`・`git show`・`sed -n`・`cat` などの出力が期待どおり error 欄に入り、先頭だけ `Exit code 1`。

- 今週も `gh pr view`・`git show`・`sed -n`・`grep -n`・`curl`（Azure の応答確認で 200 を返しているのに Exit 28 / 2）が同じ形で多数。
- 2026-11-23 の要約（9件。記録 33 件の約3割で、先週より大きく減った）: `gh pr view … | head`、`for p in python3.13 …; do which $p; done; … command -v uv`（最後の `command -v` が無し）、`for p in .venv/bin/python venv/bin/python; do [ -x $p ] && …`（最後の候補が無い）、`gh pr edit` の後の件数表示が `0`、`[ -n "$f" ] && grep …`（`$f` が空）、`ls …/*/frontend/AGENTS.md 2>/dev/null`（一致なし）、`ls -d .work/tmp`（無いことの確認）、HTML のテキストを表示する `python3`（エラー文なし）、`git show … | grep -n -A3 concurrency`（一致なし＝設定が無いことの確認）。
- 今週の傾向: 「有るか無いかを確かめる」コマンドの最後が `[ -x ]`・`[ -n ]`・`grep`・`ls` で、無い側に当たって 1 になる形が多い。

## 原因

ログから: 出力は期待どおりの内容で、エラー文が無い。推定（要確認）: 末尾の grep が一致なし、`&&` 連鎖の途中、パイプ末尾などで終了コードだけ 1 になった。実害のあるミスではなく、記録のノイズの可能性が高い。

## 直し方 / 再発防止

- フック側で「エラー文が無く出力だけある記録」を除外する案（要確認）。
- コマンド側は、意図した非ゼロなら `|| true` で終了コードをそろえる。
- 週1要約では実害のあるミスと分けて見る。
