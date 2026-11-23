---
title: コマンドの書き方違い（tail・grep・jq・git の無いオプション）
type: knowledge
origin: internal
tags: [mistake]
created: 2026-11-23
updated: 2026-11-23
---

# コマンドの書き方違い（tail・grep・jq・git の無いオプション）

- 発生回数: 4（Windows 機の収集分 2026-11-08〜11-18。初回要約）
- 最終発生日: 2026-11-18
- 収集源: claude-bash（Windows の Git Bash）
- デプロイ系: いいえ

## 症状・実行コマンド

- `git cherry-pick -q 8877036` → `usage: git cherry-pick …`（`cherry-pick` に `-q` は無い）
- `… ; tail -3 /tmp/e.txt /tmp/t.txt` の形 → `tail: option used in invalid context -- 3`（GNU の `tail` は、ファイルを複数渡すときに古い `-3` の書き方を受け付けない。推定）
- `grep -cF "$k"`（`$k` は ADR の差分の行で、`- ` で始まる文字）→ `grep: unknown option -- `（検索する文字がオプションとして読まれた）
- `gh pr view … --jq '"…"; (.comments|…)'` → `failed to parse jq expression … unexpected token ";"`（jq では式を `;` でつなげない）。PR 3 件分、同じ式で 3 回出た

## 原因

ログから: 道具が受け付けない書き方をした。`-` で始まる値を、`--` で区切らずに `grep` に渡した。jq の式を 2 つ並べるつもりで `;` を使った（jq では `,`）。

## 直し方 / 再発防止

- 初めて使うオプションは `<コマンド> --help | grep -- <オプション>` で有るか確かめる。
- 中身が分からない文字を grep に渡すときは `grep -cF -- "$k"` と `--` を入れる。
- jq で 2 つの値を出すときは `,` でつなぐ。長い式は 1 件で試してから、ループに入れる。
- `tail` は `tail -n 3 <ファイル>` と 1 ファイルずつ書く。
- `git rev-parse --short` に 2 つの版を渡す失敗は [[git-branch-state-conflict]] にまとめた。
