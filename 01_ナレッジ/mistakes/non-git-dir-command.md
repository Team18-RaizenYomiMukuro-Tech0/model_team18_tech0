---
title: git 管理外のディレクトリで git/gh を実行している
type: knowledge
origin: internal
tags: [mistake]
created: 2026-11-09
updated: 2026-11-23
---

# git 管理外のディレクトリで git/gh を実行している

- 発生回数: 8（〜2026-11-08 に 3、2026-11-09〜11-15 の収集分で +1、Windows 機の収集分 2026-11-07〜11-15 で +4）
- 最終発生日: 2026-11-15
- 収集源: claude-bash
- デプロイ系: いいえ

## 症状・実行コマンド

- `fatal: not a git repository`、`no git remotes found`（cwd は多くが `hive/agents/` 配下）。
- 今週: `/tmp/claude-501/rv` で `failed to run git: fatal: not a git repository`（一時ディレクトリは git 管理外）。

- 2026-11-23 夜の要約（Windows 機の 4件）:
  - scratchpad に `cd` してから `python make_issues.py create` → スクリプトの中の git が `fatal: not a git repository`
  - `git commit && git push … ; gh pr create …` の後の git が `fatal: not a git repository`（2件。commit・push・PR の作成は通っていた。長い 1 行の途中で `cd` した先が scratchpad か、消えた作業フォルダだった。推定）
  - `git worktree add … wt-shots-294b` が失敗した後も続けて `cd wt-shots-294b; git …` を打ち、`fatal: not a git repository` が 4 回

## 原因

ログから: リポジトリのルートでない場所で git/gh を呼んでいる。そこが非 git か別管理かは要確認。Windows 機の分は、1 回の Bash に `cd` と git を何段も並べ、途中の `cd` 先が git の外だった、または `cd` が失敗したまま続けた。

## 直し方 / 再発防止

- git の手順を何段も 1 行に並べるときは `;` でなく `&&` でつなぎ、途中の失敗で止める。作業フォルダを作った直後は `git -C <フォルダ> status` で確かめる。
- スクリプトの中から git を呼ぶときは `cwd=` にリポジトリの絶対パス（`C:/Users/…` の形）を渡す（[[windows-path-style-mismatch]]）。

- git/gh は `cd ~/GitHub/model_team18_tech0 &&` の後に実行する。
- `gh -R <org/repo>` で対象を明示する。
