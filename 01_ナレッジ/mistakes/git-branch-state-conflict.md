---
title: ブランチの状態を確認せず git を実行して衝突する
type: knowledge
origin: internal
tags: [mistake]
created: 2026-11-09
updated: 2026-11-23
---

# ブランチの状態を確認せず git を実行して衝突する

- 発生回数: 15（〜2026-11-08 に 3、2026-11-09〜11-15 の収集分で +4、2026-11-16〜11-22 の収集分で +2、Windows 機の収集分で +6）
- 最終発生日: 2026-11-22
- 収集源: claude-bash
- デプロイ系: いいえ

## 症状・実行コマンド

- `git pull --ff-only origin main` → `Diverging branches can't be fast-forwarded`
- `git worktree add -b feat/click-shapes` → `a branch named ... already exists`
- `pathspec 'docs' did not match any files`
- 今週: 終了コード 128 が 3 回（`feat/b5-share-create` が origin と食い違う状態の `git status` 後、`git show 98e88f2:…`、`git fetch … && HEAD is now at …` の後）、`fatal: Needed a single revision` 1 回。個々の原因は要確認。
- 2026-11-23 の要約（2件）:
  - `git rev-parse --short HEAD origin/main` → 終了コード 128 `fatal: Needed a single revision`（先週の同じ文も、この形の可能性が高い）
  - `git status --short | head; git pull -q --ff-only origin main` → 未追跡のファイル（`01_ナレッジ/mistakes/question-in-text-not-asked.md`、`evidence/db/` の 2 件、`command-center.json`、`package-lock.json`）が `Please move or remove them before you merge. Aborting`。`git status` は見ていたが、未追跡のファイルが取り込む側と同じ名前だった

- 2026-11-23 夜の要約（Windows 機の 6件。2026-11-07〜11-17）:
  - `git rev-parse --short HEAD origin/<ブランチ>` → `fatal: Needed a single revision`（4件。同じ形を 11-07 と 11-17 に計 4 回）
  - `git pull -q --rebase` → `Your configuration specifies to merge with the ref 'refs/heads/docs/impl-approval' from the remote, but no such ref was fetched.`（マージ後に origin のブランチが消えていた）
  - `git fetch -q origin feat/functions-files-132 …` → `couldn't find remote ref`（同じく消えたブランチ）。続く `git worktree add` と `cd ../_w193` も失敗

## 原因

ローカルが origin/main と分岐している。同名ブランチが既にある。worktree 内に無いパスを指定した。`git rev-parse --short` は 1 つの版しか受け取らない（2 つ渡すと `Needed a single revision`）。手元に置いたままの未追跡ファイルと同じ名前のファイルが、別の PR で main に入っていた（推定。要確認）。

## 直し方 / 再発防止

- 実行前に `git status` と `git branch --list <名>` を見る。
- 既存ブランチ名なら `-b` を外して worktree を作る。
- 分岐しているときは rebase するか、新しい worktree を作る。
- 2 つの版の短い ID を見るときは `git rev-parse --short HEAD; git rev-parse --short origin/main` と分ける。
- マージ済みの PR のブランチは origin から消える。`git ls-remote --heads origin <ブランチ>` で有るか見てから fetch・pull する。消えていれば `origin/main` から作り直す。
- `git status --short` に `??`（未追跡）があれば、pull の前に中身を見る。別の PR で main に入った物なら手元の分を消すか退避する（人や担当が作った物は消す前に聞く）。
