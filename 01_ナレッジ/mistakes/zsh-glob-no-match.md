---
title: zsh の glob が一致せずコマンドが止まる
type: knowledge
origin: internal
tags: [mistake]
created: 2026-11-09
updated: 2026-11-26
---

# zsh の glob が一致せずコマンドが止まる

- 発生回数: 14（〜2026-11-08 に 5、2026-11-09〜11-15 の収集分で +5、2026-11-16〜11-22 の収集分で +1、2026-11-26 の収集分で +3）
- 最終発生日: 2026-11-20
- 収集源: claude-bash
- デプロイ系: いいえ

## 症状・実行コマンド

- `(eval):20: no matches found: agents/god/inbox/*.json`
- `no matches found: --include=*.html`、`=names not found`。URL の `?` を含む `gh api` でも同様。
- 今週: `no matches found: /*.jsonl`、`no matches found: --include=*.tsx`（2回）、`no matches found: .headRefOid[0:7]`（`[ ]` を含む引数）、`= not found`（先頭 `=`）。
- 2026-11-23 の要約（1件）: 本番の API の URL を探す `grep -rhoE "…" --include=*.md --include=*.ts --include=*.yml .` → `(eval):1: no matches found: --include=*.md`。先週と同じ `--include=` のクォート忘れ。

- 2026-11-26 の要約（3件。2026-11-18〜11-20）:
  - `grep -rn "toast\|Toast" src --include=*.tsx --include=*.css -il` → `(eval):1: no matches found: --include=*.tsx`（`--include=` を `-i` の後ろに書いていて、クォートが無い。前の週と同じ形）
  - `ls .github/PULL_REQUEST_TEMPLATE* 2>/dev/null` → `no matches found: .github/PULL_REQUEST_TEMPLATE*`（`2>/dev/null` でも zsh の glob エラーは防げない。同じ行の前の `ls .github` では `pull_request_template.md`（小文字）が見えており、大文字の名前で探していた）
  - `ls 02_プロジェクト/*/evidence/reset6-tsukkomi/kurosu/ 2>/dev/null` → `no matches found: …`（そのフォルダが無い所を glob で探した）

## 原因

zsh は一致しない glob（`*`・`?`・先頭 `=`）をエラーにする。bash 前提のコマンドをそのまま実行したときに出る。

## 直し方 / 再発防止

- glob や `?` を含む引数はクォートする（`'--include=*.html'`、`'repos/...?x=1'`）。
- 一致なしを許すなら `setopt nonomatch`、または `ls ... 2>/dev/null` を使う。
- `2>/dev/null` は zsh の glob エラー（`no matches found`）を消さない。シェルが実行前に出すエラーだから。無いかもしれない名前は `ls` でなく `git ls-files | grep -i <名前>` で探す（2026-11-26 の `PULL_REQUEST_TEMPLATE*`）。
