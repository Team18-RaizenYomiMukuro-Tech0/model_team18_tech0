#!/bin/sh
# startup.sh — Azure App Service（Linux・Python）の「スタートアップ コマンド」の案: sh startup.sh
# 標準のアクセスログは接続元の IP を出すので止める（--no-access-log。設計.md N-13・D-33、運営の回答 #65）。
# Azure のアプリの設定（環境変数）: GIFTIA_DB_HOST・GIFTIA_DB_USER・GIFTIA_DB_PASSWORD・GIFTIA_ALLOWED_ORIGIN
cd "$(dirname "$0")" || exit 1
exec python -m uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}" --no-access-log
