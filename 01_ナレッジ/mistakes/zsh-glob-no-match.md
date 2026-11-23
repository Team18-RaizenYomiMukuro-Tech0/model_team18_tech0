---
title: zsh の glob が一致せずコマンドが止まる
type: knowledge
origin: internal
tags: [mistake]
created: 2026-11-09
updated: 2026-11-23
---

# zsh の glob が一致せずコマンドが止まる

- 発生回数: 11（〜2026-11-08 に 5、2026-11-09〜11-15 の収集分で +5、2026-11-16〜11-22 の収集分で +1）
- 最終発生日: 2026-11-20
- 収集源: claude-bash
- デプロイ系: いいえ

## 症状・実行コマンド

- `(eval):20: no matches found: agents/god/inbox/*.json`
- `no matches found: --include=*.html`、`=names not found`。URL の `?` を含む `gh api` でも同様。
- 今週: `no matches found: /*.jsonl`、`no matches found: --include=*.tsx`（2回）、`no matches found: .headRefOid[0:7]`（`[ ]` を含む引数）、`= not found`（先頭 `=`）。
- 2026-11-23 の要約（1件）: 本番の API の URL を探す `grep -rhoE "…" --include=*.md --include=*.ts --include=*.yml .` → `(eval):1: no matches found: --include=*.md`。先週と同じ `--include=` のクォート忘れ。

## 原因

zsh は一致しない glob（`*`・`?`・先頭 `=`）をエラーにする。bash 前提のコマンドをそのまま実行したときに出る。

## 直し方 / 再発防止

- glob や `?` を含む引数はクォートする（`'--include=*.html'`、`'repos/...?x=1'`）。
- 一致なしを許すなら `setopt nonomatch`、または `ls ... 2>/dev/null` を使う。
