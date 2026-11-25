---
title: Python のモジュールが無い（PIL・certifi・fitz）
type: knowledge
origin: internal
tags: [mistake]
created: 2026-11-09
updated: 2026-11-23
---

# Python のモジュールが無い（PIL・certifi・fitz）

- 発生回数: 4（2026-10-26〜2026-11-08 の収集分で 2、Windows 機の収集分 2026-11-08・11-13 で +2）
- 最終発生日: 2026-11-13
- 収集源: claude-bash
- デプロイ系: いいえ

## 症状・実行コマンド

- `ModuleNotFoundError: No module named 'PIL'`（画像比較の python3 実行）
- 2026-11-23 夜の要約（Windows 機の 2件）:
  - `backend/.venv/Scripts/python.exe -c "import certifi; print(certifi.where())"` → `No module named 'certifi'`（DB の SSL を certifi にする前の確認。この後 #71 で certifi を使う決定になった）
  - `python -c "import fitz"` → `No module named 'fitz'`（PDF を画像にする PyMuPDF が無い。`pdftoppm` も無かった → [[cli-tool-not-installed]]）

## 原因

実行した Python（Mac の python3・Windows の `backend/.venv`・Windows の Python 3.11）に、そのモジュールが入っていない。anaconda の python との環境差かは要確認。

## 直し方 / 再発防止

- 実行前に `python -c 'import PIL'` のように確認する。どの Python で動かすか（`backend/.venv` か、PC の Python か）も決めてから確かめる。
- 無ければ導入の承認を取るか、別の手段（sips など）で代替する。`backend` で使う物は `requirements.txt` に入っているかを見る。
