---
title: Git Bash のパス（/tmp・/c/…）と Windows のパス（C:\…）の書き方が混ざって失敗する
type: knowledge
origin: internal
tags: [mistake]
created: 2026-11-23
updated: 2026-11-23
---

# Git Bash のパス（/tmp・/c/…）と Windows のパス（C:\…）の書き方が混ざって失敗する

- 発生回数: 7（Windows 機の収集分 2026-11-07〜11-18。初回要約）
- 最終発生日: 2026-11-18
- 収集源: claude-bash（Windows の Git Bash）
- デプロイ系: いいえ

## 症状・実行コマンド

- Windows の道具に Git Bash の形のパスを渡した（3件）:
  - Python の中の `open('/tmp/e3.py')` → `FileNotFoundError`（Git Bash の `/tmp` は Python には通じない）
  - `gh pr create --body-file /tmp/pr-o1.md` → `open /tmp/pr-o1.md: The system cannot find the path specified.`
  - Python の中の `open('/c/Users/<user>/…/scratchpad/b468.md')` → `FileNotFoundError`
- `cmd //c mklink /J …` → 「無効なスイッチです」（Git Bash が `/J` をパスに変えた。`//J` と書いた別の回は通った）（1件）
- バックスラッシュがエスケープとして読まれた（3件）:
  - `sed -i 's/…/cwd=r"C:/Users/<user>\\Desktop\\…"/'` で `\U`・`\D` などが変換され、`make_issues.py` に `C:SERS…` と改行が入り `SyntaxError`。続けて同じファイルを直そうとして、もう一度 `SyntaxError`（2件）
  - Python の文字列に `'C:/Users/<user>\Downloads\…'` と書いて `SyntaxError: (unicode error) 'unicodeescape' codec can't decode bytes … truncated \UXXXXXXXX escape`（1件）

## 原因

ログから: Git Bash（MSYS）は `/tmp`・`/c/…` を自分で読み替えるが、Python・gh などの Windows の道具は読み替えない。逆に、Git Bash は `/J` のような引数をパスとみなして書き換える。`sed` の置換文字列と Python の通常の文字列では `\` がエスケープになる。

## 直し方 / 再発防止

- Windows の道具（`python`・`gh`・`node`）に渡すパスは `C:/Users/…` の形（スラッシュ）にそろえる。Git Bash の変数から渡すときは `cygpath -m "$S"` で変える。
- 一時ファイルは `/tmp` でなく、セッションの scratchpad の絶対パス（`C:/Users/…/scratchpad/…`）に置く（[[tmp-path-vanished]]）。
- Windows のパスはバックスラッシュで書かない。`sed` で書き換えず、Edit ツールで直す。
- `cmd //c` に渡すスイッチは `//J` と書く（または `MSYS_NO_PATHCONV=1` を付ける）。
