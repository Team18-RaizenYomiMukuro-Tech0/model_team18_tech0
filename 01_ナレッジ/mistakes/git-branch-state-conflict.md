---
title: ブランチの状態を確認せず git を実行して衝突する
type: knowledge
origin: internal
tags: [mistake]
created: 2026-11-09
updated: 2026-11-09
---

# ブランチの状態を確認せず git を実行して衝突する

- 発生回数: 3（2026-10-26〜2026-11-08 の収集分。初回要約）
- 最終発生日: 2026-11-07
- 収集源: claude-bash
- デプロイ系: いいえ

## 症状・実行コマンド

- `git pull --ff-only origin main` → `Diverging branches can't be fast-forwarded`
- `git worktree add -b feat/click-shapes` → `a branch named ... already exists`
- `pathspec 'docs' did not match any files`

## 原因

ローカルが origin/main と分岐している。同名ブランチが既にある。worktree 内に無いパスを指定した。

## 直し方 / 再発防止

- 実行前に `git status` と `git branch --list <名>` を見る。
- 既存ブランチ名なら `-b` を外して worktree を作る。
- 分岐しているときは rebase するか、新しい worktree を作る。
