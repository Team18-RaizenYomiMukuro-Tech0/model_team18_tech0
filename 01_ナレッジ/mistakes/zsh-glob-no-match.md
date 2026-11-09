---
title: zsh の glob が一致せずコマンドが止まる
type: knowledge
origin: internal
tags: [mistake]
created: 2026-11-09
updated: 2026-11-09
---

# zsh の glob が一致せずコマンドが止まる

- 発生回数: 5（2026-10-26〜2026-11-08 の収集分。初回要約）
- 最終発生日: 2026-11-08
- 収集源: claude-bash
- デプロイ系: いいえ

## 症状・実行コマンド

- `(eval):20: no matches found: agents/god/inbox/*.json`
- `no matches found: --include=*.html`、`=names not found`。URL の `?` を含む `gh api` でも同様。

## 原因

zsh は一致しない glob（`*`・`?`・先頭 `=`）をエラーにする。bash 前提のコマンドをそのまま実行したときに出る。

## 直し方 / 再発防止

- glob や `?` を含む引数はクォートする（`'--include=*.html'`、`'repos/...?x=1'`）。
- 一致なしを許すなら `setopt nonomatch`、または `ls ... 2>/dev/null` を使う。
