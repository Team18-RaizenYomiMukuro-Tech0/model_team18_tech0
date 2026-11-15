#!/bin/sh
# 完了条件 #5: 試作のコミットが main に含まれない。班の DB への接続が無い。
set -u
cd "$(git rev-parse --show-toplevel)"
echo "== git branch --contains HEAD =="; git branch --contains HEAD
echo "== main を含むか =="; git branch --contains HEAD | grep -E '^\*? *main$' && echo "NG: main に含まれる" || echo "OK: main に含まれない"
echo "== 試作のコードと requirements に接続・環境変数の読み込みが無いか =="
grep -R -n -i -E "pymysql|mysql|giftia_t501|dotenv|os\.environ|getenv|DB_HOST|azure" experiments/login --include=*.py --include=requirements.txt && echo "NG: 見つかった" || echo "OK: 班の DB・.env・Azure への接続は無い（接続は sqlite3 のみ）"
