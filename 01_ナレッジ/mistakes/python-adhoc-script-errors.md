---
title: 使い捨ての Python スクリプトが失敗する（相対パスのファイル無し・書き違い）
type: knowledge
origin: internal
tags: [mistake]
created: 2026-11-16
updated: 2026-11-16
---

# 使い捨ての Python スクリプトが失敗する（相対パスのファイル無し・書き違い）

- 発生回数: 15（2026-11-09〜11-15 の収集分。初回要約）
- 最終発生日: 2026-11-15
- 収集源: claude-bash
- デプロイ系: いいえ

## 症状・実行コマンド

- ファイルが無い（6回）: `FileNotFoundError: 'f2-63-done.json'`、`'outbox/pr276-r9-check.json'`、`'pr306.diff'`、`'hub35-mirin.json'`、`'_fav_now.png'`、`'m.html'`。`python3 - <<EOF` の中で相対パスを開いている。
- スクリプトの書き違い（9回）: `KeyError: 'name'`、`ValueError`（`int()` の基数 16 に空文字、`substring not found`）、`AssertionError`（置換対象の文が見つからない）、`TypeError`（`not enough arguments for format string`・`unhashable type: 'dict'`）、`IndentationError`、`NameError: name 'after' is not defined`。

## 原因

ログから: 直前の `cd` 先や一時ファイルの作成と、`python3` を呼ぶ場所・ファイル名が食い違っている（ファイル無しの 6 件）。残りは、その場で書いた変換スクリプトの文法・想定データの違い。`hive/agents/*/outbox` 配下の JSON を作る作業で多い（推定。要確認）。

## 直し方 / 再発防止

- ファイルは絶対パスで開く。実行前に `test -f` で存在を確認する（[[tmp-path-vanished]] と同じ対策）。
- 置換スクリプトは、置換前に対象の一致件数を表示してから書き換える（`assert` で止める前にどこが外れたか分かる）。
- 長いスクリプトはファイルに保存して `python3 -I <file>` で動かし、構文は先に `python3 -m py_compile` で確認する。
