---
title: 入っていないコマンド（az など）を呼んでしまう
type: knowledge
origin: internal
tags: [mistake]
created: 2026-11-23
updated: 2026-11-23
---

# 入っていないコマンド（az など）を呼んでしまう

- 発生回数: 1（2026-11-16〜11-22 の収集分。初回要約）
- 最終発生日: 2026-11-22
- 収集源: claude-bash
- デプロイ系: いいえ

## 症状・実行コマンド

- `which az && az account show …` → `az not found`

## 原因

ログから: この Mac に Azure CLI（`az`）が入っていない。この案件では Azure は PM が手で操作する決まりで、AI が `az` を使う前提になっていない。

## 直し方 / 再発防止

- Azure の状態を知りたいときは、`az` を探さずに PM に確かめてもらう（Azure CLI の導入は自前の DB を作る時に再検討する、という決まり）。
- ほかのコマンドも、初めて使うものは `command -v <名前>` で有無を見てから組み立てる。Python のモジュールは [[python-module-missing]] を見る。
