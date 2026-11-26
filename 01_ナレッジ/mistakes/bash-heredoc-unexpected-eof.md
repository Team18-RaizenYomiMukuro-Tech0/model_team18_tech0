---
title: 長い heredoc（<<'EOF'）が Git Bash で「unexpected EOF」になり、何も実行されない
type: knowledge
origin: internal
tags: [mistake]
created: 2026-11-23
updated: 2026-11-23
---

# 長い heredoc（<<'EOF'）が Git Bash で「unexpected EOF」になり、何も実行されない

- 発生回数: 20（Windows 機の収集分 2026-11-07〜11-19。初回要約）
- 最終発生日: 2026-11-19
- 収集源: claude-bash（Windows の Git Bash）
- デプロイ系: いいえ

## 症状・実行コマンド

- `cat > <ファイル> <<'EOF' … EOF` や `python - <<'EOF' … EOF`（区切りは `EOF`・`E`・`PY`・`PYEOF` など）で、数十〜二百行の本文を 1 回の Bash に入れると、`/usr/bin/bash: -c: line 146: unexpected EOF while looking for matching `''` で終了コード 2。19 件がこの文。
- 1 件は `/usr/bin/bash: eval: line 1: unexpected EOF while looking for matching ``'`（本文にバッククォートを含む `python - <<'EOF'`）。
- 中身は 5 文書の置換スクリプト（`設計.md`・`テスト設計.md`・`要求.md`）、モックの HTML、Next.js の `.tsx`・`.ts`、テスト（`tests/test_*.py`）、画面確認の `.mjs`、Issue 本文、ADR など。
- 続くコマンドが、作られなかったファイルを開いて失敗することがある（例: `/tmp/w/adr.py` が無い。→ [[tmp-path-vanished]]）。

## 原因

ログから: どれも本文が長く、本文の中に `'`（Python の文字列・JS・HTML の属性）を多く含む。bash は heredoc として受け取れておらず、本文の `'` を引用の始まりとして読んで、閉じる `'` が無いまま終わっている。推定（要確認）: Claude Code の Bash ツールが Windows でコマンドを `bash -c` / `eval` に渡すときに、区切り行や改行が崩れて heredoc と認識されない。短い heredoc は通っていることが多く、どの長さ・どの文字で崩れるかは要確認。

## 直し方 / 再発防止

- 長いファイルや置換スクリプトは、heredoc で作らずに **Write ツールでファイルに書き**、`python -I -X utf8 <ファイルの絶対パス>` で動かす（[[python-adhoc-script-errors]] の「ファイルに保存して動かす」と同じ）。
- どうしても heredoc を使うなら、本文は短くし、区切りは `'EOF'` のようにクォートして、区切り行の前後に空白を入れない。
- この失敗では何も実行されていない。同じコマンドを打ち直さず、作られるはずのファイルが無い前提で次を組み立てる。
