---
title: 入っていないコマンド（az・pandoc・soffice など）を呼んでしまう
type: knowledge
origin: internal
tags: [mistake]
created: 2026-11-23
updated: 2026-11-23
---

# 入っていないコマンド（az・pandoc・soffice など）を呼んでしまう

- 発生回数: 5（2026-11-16〜11-22 の収集分で 1、Windows 機の収集分 2026-11-07〜11-22 で +4）
- 最終発生日: 2026-11-22
- 収集源: claude-bash
- デプロイ系: いいえ

## 症状・実行コマンド

- `which az && az account show …` → `az not found`
- 2026-11-23 夜の要約（Windows 機の 4件）:
  - `pandoc -t markdown <要件定義書>.docx` → `pandoc: command not found`（続く `wc`・`cat` も出力ファイルが無く失敗）
  - `python …/soffice.py --headless --convert-to pdf` の後 `ls out.pdf` → 無い（LibreOffice が入っていないためと推定。要確認）
  - 有無の確認（2件）: `which mysql`・`ls "/c/Program Files/MySQL"`、`which soffice pdftoppm`・`ls ".../LibreOffice/program/soffice.exe"` → どれも無い。確認なので実害は無い

## 原因

ログから: この Mac に Azure CLI（`az`）が入っていない。この案件では Azure は PM が手で操作する決まりで、AI が `az` を使う前提になっていない。Windows 機には pandoc・LibreOffice（soffice）・pdftoppm・mysql が入っていない。

## 直し方 / 再発防止

- Azure の状態を知りたいときは、`az` を探さずに PM に確かめてもらう（Azure CLI の導入は自前の DB を作る時に再検討する、という決まり）。
- ほかのコマンドも、初めて使うものは `command -v <名前>` で有無を見てから組み立てる。Python のモジュールは [[python-module-missing]] を見る。
- Windows 機で docx を読む・作るときは、pandoc や soffice に頼らず python-docx（入っている。2026-11-13 に確認）を使う。DB は mysql コマンドでなく `pymysql`（入っている）と `backend/scripts/db_admin.py` を使う。
