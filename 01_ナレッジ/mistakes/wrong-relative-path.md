---
title: 今いる場所を思い違えて、無いパスを指定する
type: knowledge
origin: internal
tags: [mistake]
created: 2026-11-23
updated: 2026-11-23
---

# 今いる場所を思い違えて、無いパスを指定する

- 発生回数: 9（2026-11-16〜11-22 の収集分で 3、Windows 機の収集分 2026-11-07〜11-17 で +6）
- 最終発生日: 2026-11-21
- 収集源: claude-bash
- デプロイ系: いいえ

## 症状・実行コマンド

- リポジトリのルートで `ls 02_プロジェクト/giftia-ui-renewal/ … inputs` → `ls: inputs: No such file or directory`（`inputs` は `02_プロジェクト/giftia-ui-renewal/inputs` にある。同じ出力に載っている）
- リポジトリのルートで `git -C .command-center/worktrees/fix-240-front status` → `fatal: cannot change to '.command-center/worktrees/fix-240-front': No such file or directory`（3 回。実際の作業フォルダ名は `fix-240-front-mirin`）
- `02_プロジェクト/giftia-ui-renewal` で `grep … inputs/README.md … ../../01_ナレッジ; ls ../../inputs ../inputs` → `ls` が失敗（リポジトリのルートに `inputs` は無い）

- 2026-11-23 夜の要約（Windows 機の 6件）:
  - `hive/agents/<担当>/outbox/<名前>.json` を `sed -i` で直そうとして `can't read … No such file or directory`（3件。`giftia-59.json`・`v74b-done.json`・`giftia-merge-main3.json`。送った後で `.sent/` に移っていた、または名前を推測で書いた。推定）
  - `git -C ../../../wt-r5-291` → `cannot change to … No such file or directory`（`hive/agents/mi-rin-…` から数えた `../` の数が合っていない）
  - `cd ../wt-shots-437` → `No such file or directory`（作っていない作業フォルダ）
  - `cd model_team18_tech0` → 無い、`../wt-m414` → `is not a working tree`（`Tech0/` から見た相対パスを、別の場所で使った）

## 原因

ログから: 実行した場所（cwd）と、パスを書くときに頭にあった場所が食い違っている。作業フォルダ名は、担当名の付いた実際の名前を確かめずに推測で書いた。一時ディレクトリが消える [[tmp-path-vanished]] とは別で、こちらは最初から無いパスを指定している。

## 直し方 / 再発防止

- 知らないパスは、使う前に `ls` で親を見るか、`git ls-files | grep <名前>` で探してから書く。
- 作業フォルダは `git worktree list` で実際の名前を確かめてから `git -C` に渡す。
- `hive/agents/*/outbox` のファイルは送ると `.sent/` に移る。直す前に `ls outbox outbox/.sent` で今どこにあるかを見る。送った後なら直さずに新しく送る（推定。要確認）。
- 長いコマンドの中でパスを決め打ちせず、リポジトリのルートからの絶対パス（`$(git rev-parse --show-toplevel)/…`）で書く。
