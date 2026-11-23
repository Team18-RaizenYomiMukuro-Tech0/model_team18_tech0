---
title: 今いる場所を思い違えて、無いパスを指定する
type: knowledge
origin: internal
tags: [mistake]
created: 2026-11-23
updated: 2026-11-23
---

# 今いる場所を思い違えて、無いパスを指定する

- 発生回数: 3（2026-11-16〜11-22 の収集分。初回要約）
- 最終発生日: 2026-11-21
- 収集源: claude-bash
- デプロイ系: いいえ

## 症状・実行コマンド

- リポジトリのルートで `ls 02_プロジェクト/giftia-ui-renewal/ … inputs` → `ls: inputs: No such file or directory`（`inputs` は `02_プロジェクト/giftia-ui-renewal/inputs` にある。同じ出力に載っている）
- リポジトリのルートで `git -C .command-center/worktrees/fix-240-front status` → `fatal: cannot change to '.command-center/worktrees/fix-240-front': No such file or directory`（3 回。実際の作業フォルダ名は `fix-240-front-mirin`）
- `02_プロジェクト/giftia-ui-renewal` で `grep … inputs/README.md … ../../01_ナレッジ; ls ../../inputs ../inputs` → `ls` が失敗（リポジトリのルートに `inputs` は無い）

## 原因

ログから: 実行した場所（cwd）と、パスを書くときに頭にあった場所が食い違っている。作業フォルダ名は、担当名の付いた実際の名前を確かめずに推測で書いた。一時ディレクトリが消える [[tmp-path-vanished]] とは別で、こちらは最初から無いパスを指定している。

## 直し方 / 再発防止

- 知らないパスは、使う前に `ls` で親を見るか、`git ls-files | grep <名前>` で探してから書く。
- 作業フォルダは `git worktree list` で実際の名前を確かめてから `git -C` に渡す。
- 長いコマンドの中でパスを決め打ちせず、リポジトリのルートからの絶対パス（`$(git rev-parse --show-toplevel)/…`）で書く。
