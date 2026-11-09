---
title: macOS(BSD) と GNU のコマンド差で失敗する
type: knowledge
origin: internal
tags: [mistake]
created: 2026-11-09
updated: 2026-11-09
---

# macOS(BSD) と GNU のコマンド差で失敗する

- 発生回数: 3（2026-10-26〜2026-11-08 の収集分。初回要約）
- 最終発生日: 2026-11-08
- 収集源: claude-bash
- デプロイ系: いいえ

## 症状・実行コマンド

- `sed -i 's/.../'`: `extra characters at the end of d command`
- `cat -A`: `illegal option`、`head -0`: `illegal line count`
- grep（ugrep）: 繰り返し `{0,300}` の正規表現が `exceeds complexity limits`

## 原因

macOS の sed/cat/head は BSD 版で GNU のオプションが使えない。ugrep は繰り返し回数の大きい正規表現に上限がある。

## 直し方 / 再発防止

- `sed -i ''`（BSD）か Python で置換する。
- `cat -A` は `cat -et`。`head -0` は使わない。
- 長い正規表現は分割するか Grep ツールを使う。
