---
title: 一時ディレクトリのパスが無くなっている
type: knowledge
origin: internal
tags: [mistake]
created: 2026-11-09
updated: 2026-11-26
---

# 一時ディレクトリのパスが無くなっている

- 発生回数: 25（〜2026-11-08 に 9、2026-11-09〜11-15 の収集分で +6、2026-11-16〜11-22 の収集分で +4、Windows 機の収集分で +4、2026-11-26 の収集分で +2）
- 最終発生日: 2026-11-21
- 収集源: claude-bash
- デプロイ系: いいえ

## 症状・実行コマンド

- `cd $TMPDIR/wt/docs` や `cp /tmp/claude-501/r7.png ...`、`ls $TMPDIR/ps` が `No such file or directory`。
- 今週も同じ型: `cd /private/tmp/claude-501/…/<セッションID>…` が `no such file or directory`、`ls /tmp/claude-501/hs`、`cut -c1-260 $TMPDIR/d5.txt`、`wc …/scratchpad/…`、`mv x.json ../x.held.json`（移動先が無い）。
- 2026-11-23 の要約（4件）:
  - `cd $TMPDIR && python3 - <<'EOF' … open("new.json")` → `FileNotFoundError: 'new.json'`（`$TMPDIR` に前のファイルが無い）
  - `S=/private/tmp/claude-501/…/<セッションID>; … sed -i '' … $S/gift.mjs` → `No such file or directory`（直前と直後のコマンドは `…/<セッションID>/scratchpad`。`/scratchpad` を書き落とした）
  - `…/scratchpad/venv-e09/bin/python` → 終了コード 127 `no such file or directory`（前に作った仮想環境が無い）
  - `cd …/scratchpad && …` の中で `sheet.swift`・`qsheet.jpg` が `No such file or directory`

- 2026-11-23 夜の要約（Windows 機の 4件。2026-11-08〜11-17）:
  - `python /tmp/w/adr.py` → `can't open file …\AppData\Local\Temp\w\adr.py`（直前の heredoc が崩れてファイルが作られていなかった。→ [[bash-heredoc-unexpected-eof]]）
  - `cd …/scratchpad/w375/backend` → `No such file or directory`（scratchpad の中の作業フォルダが無い）
  - `cat $TEMP/i63.out`、`ls …/scratchpad/c430b.md` → `No such file or directory`（前に作ったはずの出力・本文が無い）

- 2026-11-26 の要約（2件。同時刻の重複記録。2026-11-21）: `git -C <作業フォルダ> commit -F /private/tmp/…/msg243.txt` → `fatal: could not read log file '…/msg243.txt': No such file or directory`（コミットメッセージのファイルを前に作ったつもりで、無かった）。同じ記録が 2 行あり、2 回と数えた。

## 原因

ログから: `$TMPDIR` が `/tmp/claude-501` と `/var/folders/.../T` で食い違って見える。一時ファイルや worktree が前の操作で消えている。推定（要確認）: コマンドごとにシェルが初期化され、別セッションの `$TMPDIR` を前提にしている。

## 直し方 / 再発防止

- 一時ファイルは使う直前に `mkdir -p` で作り、同じコマンド内で完結させる。
- `$TMPDIR` を持ち越さず、絶対パスで書く。
- `cd` の前に `test -d` で存在を確認する。
- Windows では `/tmp` が道具によって別の場所を指す。[[windows-path-style-mismatch]] を見る。
- 長いパスは変数（`S=…`）に入れたら、後のコマンドでも同じ変数を使い、手で書き直さない（2026-11-23 の `/scratchpad` 書き落とし）。
- 仮想環境や作業用ファイルは scratchpad に置いたままにせず、次のセッションでも使うなら消えない決まった場所（例: 既にある `backend/.venv`）を使う（推定。要確認）。
- コミットメッセージを `-F <ファイル>` で渡すときは、同じコマンドの中でファイルを作る（`mkdir -p` のあと Write ツールで書く）か、`-m` を使う。前のコマンドで作ったファイルを前提にしない（2026-11-26 の `msg243.txt`）。
