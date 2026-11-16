---
title: macOS(BSD) と GNU のコマンド差で失敗する
type: knowledge
origin: internal
tags: [mistake]
created: 2026-11-09
updated: 2026-11-16
---

# macOS(BSD) と GNU のコマンド差で失敗する

- 発生回数: 9（〜2026-11-08 に 3、2026-11-09〜11-15 の収集分で +6：BSD sed 3・ugrep の正規表現エラー 3）
- 最終発生日: 2026-11-15
- 収集源: claude-bash
- デプロイ系: いいえ

## 症状・実行コマンド

- `sed -i 's/.../'`: `extra characters at the end of d command`
- `cat -A`: `illegal option`、`head -0`: `illegal line count`
- grep（ugrep）: 繰り返し `{0,300}` の正規表現が `exceeds complexity limits`
- 今週: `sed -i 's#…#…#'` が `sed: 1:` / `sed: 2:` で失敗（3回。BSD sed は `-i` の後に拡張子の引数が要る）。`ugrep: error: error at position N`（3回。正規表現の書き方が ugrep で通らない。どの構文かは要確認）。

## 原因

macOS の sed/cat/head は BSD 版で GNU のオプションが使えない。ugrep は繰り返し回数の大きい正規表現に上限がある。

## 直し方 / 再発防止

- `sed -i ''`（BSD）か Python で置換する。
- `cat -A` は `cat -et`。`head -0` は使わない。
- 長い正規表現は分割するか Grep ツールを使う。
