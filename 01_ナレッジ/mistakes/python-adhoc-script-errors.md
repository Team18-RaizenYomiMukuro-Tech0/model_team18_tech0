---
title: 使い捨ての Python スクリプトが失敗する（相対パスのファイル無し・書き違い）
type: knowledge
origin: internal
tags: [mistake]
created: 2026-11-16
updated: 2026-11-23
---

# 使い捨ての Python スクリプトが失敗する（相対パスのファイル無し・書き違い）

- 発生回数: 39（2026-11-09〜11-15 の収集分で 15、2026-11-16〜11-22 の収集分で +9、Windows 機の収集分 2026-11-07〜11-22 で +15。Node の使い捨てスクリプトも同じ型に入れた）
- 最終発生日: 2026-11-22
- 収集源: claude-bash
- デプロイ系: いいえ

## 症状・実行コマンド

- ファイルが無い（6回）: `FileNotFoundError: 'f2-63-done.json'`、`'outbox/pr276-r9-check.json'`、`'pr306.diff'`、`'hub35-mirin.json'`、`'_fav_now.png'`、`'m.html'`。`python3 - <<EOF` の中で相対パスを開いている。
- スクリプトの書き違い（9回）: `KeyError: 'name'`、`ValueError`（`int()` の基数 16 に空文字、`substring not found`）、`AssertionError`（置換対象の文が見つからない）、`TypeError`（`not enough arguments for format string`・`unhashable type: 'dict'`）、`IndentationError`、`NameError: name 'after' is not defined`。
- 2026-11-23 の要約（9件）:
  - HTML の文字列置換で対象が見つからない・複数ある（4件。どれも `giftia-plan.html` などの発表資料の HTML）: `AssertionError: (0, '<div class="days">…')`、`AssertionError: (3, '<div class="card2 c1">…')`、`AssertionError: ('<div class="card2 c2">\n      <h3>A', 2)`、`ValueError: substring not found`（`s.index('<div class="deck">')`）
  - Node の画面確認スクリプト（3件。同じ `gift.mjs`）: `today(initial): undefined` のまま `new Date(today+"T00:00:00").toISOString()` → `RangeError: Invalid time value`。3 回続けて同じ所で落ちた
  - 環境変数が無い（1件）: `os.environ["API"]` → `KeyError: 'API'`
  - データの型の想定違い（1件）: `.command-center/records/*.jsonl` の `at` を文字列と比べて `TypeError: '>' not supported between instances of 'int' and 'str'`（数値の行が混じっていた）

- 2026-11-23 夜の要約（Windows 機の 15件）:
  - 置換の対象が無い（7件）: 5文書・Issue・`DB管理手順.md`・デプロイ作業書の HTML の置換で `AssertionError: ('要件.md', '0以下は1にする（#53-4）。', 0)` の形、`ValueError: substring not found`、自作の `resolve.py` の `assert k[0]==len(choices)`。前の置換や別の PR で文が既に変わっていた（推定）
  - データの形の想定違い（5件）: `hive/tasks.json` が空の dict で `IndexError`、画面確認の結果の JSON に `'meta'` が無く `KeyError`、表の最後の行の取り出しで `IndexError`、空の応答を `json.loads` して `JSONDecodeError`（サーバーが起きる前に読んだ。推定）、docx の中の正規表現が一致せず `'NoneType' object has no attribute 'group'`
  - 書き違い（3件）: 色の値 `#fff`（3 桁）を 6 桁として `int(…,16)` → `ValueError`、PR 本文の f-string の中の `{share_id}` が `NameError`、関数の引数名の打ち間違い `unexpected keyword argument 'nodo'`。作っていた検査スクリプト `guard-worktree-remove.py` の `NameError: name 'native' is not defined` も同じ型
  - Windows 特有の文字コード・heredoc の崩れは別の型にした（[[windows-cp932-encoding]]・[[bash-heredoc-unexpected-eof]]）

## 原因

ログから: 直前の `cd` 先や一時ファイルの作成と、`python3` を呼ぶ場所・ファイル名が食い違っている（ファイル無しの 6 件）。残りは、その場で書いた変換スクリプトの文法・想定データの違い。2026-11-23 の分は、置換対象の HTML が前の置換で既に変わっていた／同じ部品が複数あった（推定。要確認）ことと、画面から日付を取る処理が値を取れなかったこと（原因は要確認）。`hive/agents/*/outbox` 配下の JSON を作る作業で多い（推定。要確認）。

## 直し方 / 再発防止

- ファイルは絶対パスで開く。実行前に `test -f` で存在を確認する（[[tmp-path-vanished]] と同じ対策）。
- 置換スクリプトは、置換前に対象の一致件数を表示してから書き換える（`assert` で止める前にどこが外れたか分かる）。
- 長いスクリプトはファイルに保存して `python3 -I <file>` で動かし、構文は先に `python3 -m py_compile` で確認する。
- HTML の置換は、直前に対象の部分を `grep -c` で数えてから書く。同じ部品が複数あるときは、前後の一意な文字（`id=` など）まで含めて指定する（2026-11-23 の 4 件）。
- 同じエラーで落ちたら、同じコマンドを打ち直す前に原因の値を表示する（`gift.mjs` は `today` が `undefined` のまま 3 回打ち直した）。
- 環境変数は `os.environ.get("API")` で受け、無ければ分かる文を出して止める。ログの JSON は型が混ざる前提で `str()` にそろえてから比べる。
- 文の中に `{…}` を含む本文を f-string で作らない（`{{share_id}}` と書くか、普通の文字列で足す）。
- サーバーや画面の応答を読むときは、空でないことを確かめてから `json.loads` する。
