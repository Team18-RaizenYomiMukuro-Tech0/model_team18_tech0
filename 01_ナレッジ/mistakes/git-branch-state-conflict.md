---
title: ブランチの状態を確認せず git を実行して衝突する
type: knowledge
origin: internal
tags: [mistake]
created: 2026-11-09
updated: 2026-11-16
---

# ブランチの状態を確認せず git を実行して衝突する

- 発生回数: 7（〜2026-11-08 に 3、2026-11-09〜11-15 の収集分で +4）
- 最終発生日: 2026-11-15
- 収集源: claude-bash
- デプロイ系: いいえ

## 症状・実行コマンド

- `git pull --ff-only origin main` → `Diverging branches can't be fast-forwarded`
- `git worktree add -b feat/click-shapes` → `a branch named ... already exists`
- `pathspec 'docs' did not match any files`
- 今週: 終了コード 128 が 3 回（`feat/b5-share-create` が origin と食い違う状態の `git status` 後、`git show 98e88f2:…`、`git fetch … && HEAD is now at …` の後）、`fatal: Needed a single revision` 1 回。個々の原因は要確認。

## 原因

ローカルが origin/main と分岐している。同名ブランチが既にある。worktree 内に無いパスを指定した。

## 直し方 / 再発防止

- 実行前に `git status` と `git branch --list <名>` を見る。
- 既存ブランチ名なら `-b` を外して worktree を作る。
- 分岐しているときは rebase するか、新しい worktree を作る。
