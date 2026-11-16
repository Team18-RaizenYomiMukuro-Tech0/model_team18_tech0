---
title: 一時ディレクトリのパスが無くなっている
type: knowledge
origin: internal
tags: [mistake]
created: 2026-11-09
updated: 2026-11-16
---

# 一時ディレクトリのパスが無くなっている

- 発生回数: 15（〜2026-11-08 に 9、2026-11-09〜11-15 の収集分で +6）
- 最終発生日: 2026-11-15
- 収集源: claude-bash
- デプロイ系: いいえ

## 症状・実行コマンド

- `cd $TMPDIR/wt/docs` や `cp /tmp/claude-501/r7.png ...`、`ls $TMPDIR/ps` が `No such file or directory`。
- 今週も同じ型: `cd /private/tmp/claude-501/…/<セッションID>…` が `no such file or directory`、`ls /tmp/claude-501/hs`、`cut -c1-260 $TMPDIR/d5.txt`、`wc …/scratchpad/…`、`mv x.json ../x.held.json`（移動先が無い）。

## 原因

ログから: `$TMPDIR` が `/tmp/claude-501` と `/var/folders/.../T` で食い違って見える。一時ファイルや worktree が前の操作で消えている。推定（要確認）: コマンドごとにシェルが初期化され、別セッションの `$TMPDIR` を前提にしている。

## 直し方 / 再発防止

- 一時ファイルは使う直前に `mkdir -p` で作り、同じコマンド内で完結させる。
- `$TMPDIR` を持ち越さず、絶対パスで書く。
- `cd` の前に `test -d` で存在を確認する。
