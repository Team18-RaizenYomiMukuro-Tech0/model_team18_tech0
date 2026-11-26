---
title: 新しい作業フォルダ（worktree）に node_modules や .venv が無く、テストが動かない
type: knowledge
origin: internal
tags: [mistake]
created: 2026-11-23
updated: 2026-11-23
---

# 新しい作業フォルダ（worktree）に node_modules や .venv が無く、テストが動かない

- 発生回数: 2（Windows 機の収集分 2026-11-15〜11-16。初回要約）
- 最終発生日: 2026-11-16
- 収集源: claude-bash（Windows の Git Bash）
- デプロイ系: いいえ

## 症状・実行コマンド

- `wt-r6-292/frontend` で `npx tsc --noEmit` → `This is not the tsc command you are looking for`、`npx eslint .` → `npm warn exec The following package was not found and will be installed: eslint@10.15.0` の後 `Cannot find package 'eslint' imported from …/eslint.config.mjs`
- `wt-398/backend` で `.venv/Scripts/python.exe …` → 終了コード 127 `No such file or directory`

## 原因

ログから: `git worktree add` で作った作業フォルダには、git の管理外の `frontend/node_modules` と `backend/.venv` が無い。`npx` は、無いと別の物（`tsc` という名前の別のパッケージ・最新の eslint）を取りに行く。

## 直し方 / 再発防止

- 新しい作業フォルダでテストする前に、`ls frontend/node_modules/.bin` と `ls backend/.venv/Scripts` で有るか見る。
- 無ければ、元のフォルダの物を使う。Python は元の `backend/.venv/Scripts/python.exe` を絶対パスで呼ぶ。Node は `cmd //c mklink //J "<worktree>\frontend\node_modules" "<元>\frontend\node_modules"` でつなぐ（別の回でこの形が通っている）。
- `npx` が「will be installed」と言ったら止める。知らない版を取りに行かせない。
