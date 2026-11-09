---
title: git 管理外のディレクトリで git/gh を実行している
type: knowledge
origin: internal
tags: [mistake]
created: 2026-11-09
updated: 2026-11-09
---

# git 管理外のディレクトリで git/gh を実行している

- 発生回数: 3（2026-10-26〜2026-11-08 の収集分。初回要約）
- 最終発生日: 2026-11-07
- 収集源: claude-bash
- デプロイ系: いいえ

## 症状・実行コマンド

- `fatal: not a git repository`、`no git remotes found`（cwd は多くが `hive/agents/` 配下）。

## 原因

ログから: リポジトリのルートでない場所で git/gh を呼んでいる。そこが非 git か別管理かは要確認。

## 直し方 / 再発防止

- git/gh は `cd ~/GitHub/model_team18_tech0 &&` の後に実行する。
- `gh -R <org/repo>` で対象を明示する。
