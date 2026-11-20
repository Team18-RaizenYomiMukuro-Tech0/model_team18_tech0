#!/bin/sh
# .githooks/pre-commit の秘密の検査を、一時の git リポジトリで確かめる（#553）。
# 値はすべて偽物（x の並び）。使い方: sh scripts/test_pre_commit_secrets.sh
ROOT=$(cd "$(dirname "$0")/.." && pwd)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
cd "$TMP" || exit 1
git init -q . && git config user.email t@example.com && git config user.name t
# 最初のコミットは、フックを有効にする前に作る（検査を迂回するオプションは使わない）
echo init > README && git add README && git commit -q -m init
mkdir -p .githooks && cp "$ROOT/.githooks/pre-commit" .githooks/pre-commit
chmod +x .githooks/pre-commit
git config core.hooksPath .githooks

X40=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# この検査自身を、フックに引っかけないよう、キー名は2つに分けて組み立てる
PW=Pass; PW="${PW}word"; PD=Pw; PD="${PD}d"; AK=Account; AK="${AK}Key"; GD=GIFTIA_DB_PASS; GD="${GD}WORD"
pass=0
fail=0

# check <名前> <期待: block|allow> <ファイル名> <内容>
check() {
  name=$1; want=$2; file=$3; body=$4
  printf '%s\n' "$body" > "$file"
  git add -f "$file"
  out=$(git commit -q -m t 2>&1); code=$?
  ok=0
  [ "$want" = block ] && [ "$code" -eq 1 ] && ok=1
  [ "$want" = allow ] && [ "$code" -eq 0 ] && ok=1
  if [ "$ok" -eq 1 ]; then
    pass=$((pass+1)); echo "PASS $name (期待 $want, 終了コード $code)"
  else
    fail=$((fail+1)); echo "FAIL $name (期待 $want, 終了コード $code)"; echo "$out"
  fi
  # 後片付け: 止まった時はステージから外す。通った時はコミットを巻き戻す
  if [ "$code" -eq 0 ]; then git reset -q --hard HEAD~1; else git reset -q; fi
  rm -f "$file"
}

check "#1 AccountKey" block a.txt "DefaultEndpointsProtocol=https;AccountName=x;${AK}=$X40"
check "#2 SQL Password" block b.txt "Server=tcp:x.database.windows.net;Database=x;User ID=x;${PW}=xxxxxxxx;"
check "#2 SQL Pwd" block b.txt "Server=tcp:x.database.windows.net;${PD}=xxxxxxxx;"
check "#3 GIFTIA_DB_PASSWORD" block c.txt "${GD}=xxxxxxxx"
check "#5 sk- の偽の値" block d.txt "OPENAI_API_KEY=sk-$X40"
check "#5 .env ファイル" block .env "A=x"
check "#5 .env.example の空の値" allow .env.example "${GD}=
OPENAI_API_KEY="
check "#5 説明文の Password=" allow e.md "接続文字列の ${PW}= の部分は .env に書く"

echo "---- 合格 $pass 件 / 不合格 $fail 件"
[ "$fail" -eq 0 ]
