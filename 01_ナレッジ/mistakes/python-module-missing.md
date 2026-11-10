---
title: Python のモジュールが無い（PIL）
type: knowledge
origin: internal
tags: [mistake]
created: 2026-11-09
updated: 2026-11-09
---

# Python のモジュールが無い（PIL）

- 発生回数: 2（2026-10-26〜2026-11-08 の収集分。初回要約）
- 最終発生日: 2026-11-08
- 収集源: claude-bash
- デプロイ系: いいえ

## 症状・実行コマンド

- `ModuleNotFoundError: No module named 'PIL'`（画像比較の python3 実行）

## 原因

実行した python3 に Pillow が入っていない。anaconda の python との環境差かは要確認。

## 直し方 / 再発防止

- 実行前に `python3 -c 'import PIL'` で確認する。
- 無ければ導入の承認を取るか、別の手段（sips など）で代替する。
