---
title: Windows の Python が cp932 で読み書きして、日本語や記号で落ちる
type: knowledge
origin: internal
tags: [mistake]
created: 2026-11-23
updated: 2026-11-23
---

# Windows の Python が cp932 で読み書きして、日本語や記号で落ちる

- 発生回数: 10（Windows 機の収集分 2026-11-06〜11-18。初回要約）
- 最終発生日: 2026-11-18
- 収集源: claude-bash（Windows の Git Bash）
- デプロイ系: いいえ

## 症状・実行コマンド

- 表示で落ちる（5件）: `print(...)` が `UnicodeEncodeError: 'cp932' codec can't encode character '✓'`（✓）・`'—'`（—）・`'⽬'`・`'軀'`。PDF・docx・5文書（`仕様.md`）の中身を表示したとき。
- 読み込みで落ちる（2件）: `json.load(open('hive/fleet.json'))`、`open(…/e416.py).read()` が `UnicodeDecodeError: 'cp932' codec can't decode byte 0x86`（`encoding` を指定していない）。
- 置換の対象が文字化けして見つからない（1件）: スクリプト `edit39.py` の中の文字列が `' / �� / 0 /'` になっていて `AssertionError`。
- git が日本語のファイル名を `"02_\343\203\227…/仕様.md"` の形（8 進のエスケープ）で出し、それを `grep` に渡して `No such file or directory`（1件。`git diff --name-only --diff-filter=U` の結果をそのまま使った）。
- Windows のタスクスケジューラの週1要約のログ（`digest-20261113-121941.log`）が文字化けしていて、`01_ナレッジ` のパスも化けて見え、「今週は記録なし（inbox が空/無し）」で終わっていた（1件。2026-11-13）。この時 inbox には 11-01 からの記録があった。

## 原因

ログから: Windows の Python 3.11 は、`encoding` を指定しない `open()` と、コンソールへの `print()` で cp932 を使う。UTF-8 の日本語や、cp932 に無い記号（✓・— など）で落ちる。git は既定（`core.quotepath=true`）で日本語のパスをエスケープして出す。週1要約のスクリプトの文字化けは、PowerShell が BOM の無い UTF-8 のスクリプトを cp932 として読んだためと推定（要確認）。そのため inbox のパスを取り違え、Windows 機の記録が 11-23 まで一度も要約されていなかった（推定。要確認）。

## 直し方 / 再発防止

- Python は `python -X utf8` で動かすか、先に `export PYTHONIOENCODING=utf-8 PYTHONUTF8=1` を入れる。
- `open()` には必ず `encoding="utf-8"` を付ける（`json.load(open(p, encoding="utf-8"))`）。
- git の日本語パスを次のコマンドに渡すときは `git -c core.quotepath=false diff --name-only …` にする。
- 週1要約の `run-digest.ps1` は UTF-8（BOM 付き）で保存されているか、ログの中のパスが化けていないかを確かめる（要確認。直すかは PM が決める）。
