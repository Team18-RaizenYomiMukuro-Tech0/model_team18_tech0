# Azure 公開手順（画面と API を無料のプラン F1 に置く）

- 対象: Issue #132（O1）。設計 D-33「配置と運用」、N-07（検索エンジンに載せない）、N-08（費用）、N-04（接続情報）、N-13（ログ）、ADR-004。
- 実行者: PM（Azure のログインとリソースの作成は PM が手で行う）。期限は 11/11。公開は 11/12〜12/12。
- 状態: **下書き。Azure ではまだ1つも実行していない。** 画面側の「手元でビルド → 配置用の zip → `next start` で起動」は手元で確かめた（下の「手元で確かめた範囲」）。Azure 上の挙動は、PM の初回の実行で確かめる。うまくいかない所は「困ったとき」へ。
- この手順書には**値を書かない**。ホスト名・ユーザー名・パスワード・公開 URL は書かず、`<…>` の名前で示す。

## 先に決まっていないこと（ここで止まる）

- **公開版の画面が API を呼ぶ先**。画面のコードは今 `/api/candidates` のように**同じホストの相対パス**で呼ぶ（`frontend/src/lib/api.ts`）。公開版では、画面と API が別のホスト（`〜.azurewebsites.net` が2つ）になるので、このままでは画面から API に届かない。呼び方（画面のサーバーが API に渡す／ブラウザが API を直接呼ぶ／1つのアプリにまとめる、など）は設計に書かれておらず、PM の決定待ち（Mi-rin の領域）。**手順 5 は決まるまで実行しない。** 手順 1〜4・6 の API 単体の確認までは進められる。
- 画面の `/` の表示（手順 4）は API を呼ばない範囲なら確認できる。検索結果などの API を使う表示は、上が決まってから。

## 0. 先に読む（費用が出ないために）

| 守ること | 理由・出典 |
| --- | --- |
| App Service プランは **F1（Free）** を自分で選ぶ。ポータルの作成画面は初期値が有料のことがある | 設計 D-33、Issue #132 |
| **Application Insights** と **Container Registry** は作らない（作成画面の「監視」で Application Insights を **いいえ** にする） | Issue #132、設計 D-18 |
| 独自ドメインは買わない（F1 は独自ドメイン 0。`〜.azurewebsites.net` だけ） | [公式: サブスクリプションの制限](https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/azure-subscription-service-limits) |
| 配置は**コードのまま**（zip）。コンテナにしない | 設計 D-33 |
| 公開に使うのは **main ブランチ**だけ | 設計 D-33 |
| 診断設定・Log Analytics など、Azure のログを**追加でオンにしない** | 設計 D-33、N-13 |

**F1 の制限（公式の表の値。2026-11-09 に確認）**: 1 日の CPU 時間 60 分、5 分あたりの CPU 時間 3 分、メモリ 1,024 MB（プラン全体）、ストレージ 1 GB（プラン全体）、1 日の送信 165 MB、Linux の WebSocket 5 本、Always On なし、デプロイスロットなし、アプリ 10 個まで／プラン。出典: [Azure サブスクリプションとサービスの制限（App Service の表）](https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/azure-subscription-service-limits)、[App Service プランの概要](https://learn.microsoft.com/en-us/azure/app-service/overview-hosting-plans)。

- **効いてくること**: 画面と API の2アプリが同じプランを使うので、CPU・メモリ・転送量は共有になる（コミュニティの回答では、無料アプリの CPU 上限は同じリージョンで共有され、超えるとアプリが止まり 403 になる、とある。公式の表には「超えたらどうなるか」は書かれていないので、実際の動作は初回に確かめる）。Always On が無いので、しばらく使わないと止まり、**最初の1回は遅い**（N-03a の 2 秒は最初の1回では守れないことがある。計測は T3 #67）。
- **有料になりうる選択肢**（選ばない）: Basic 以上のプラン（B1 など）、Application Insights、Container Registry、デプロイスロット、Always On、Azure SQL・MySQL の新規作成。

## 1. 準備（PM の PC）

1. Azure CLI を入れる（未導入なら）。Mac: `brew install azure-cli`。Windows: `winget install -e --id Microsoft.AzureCLI`。
2. ログインする（PM が画面で操作する）。無料の枠で使うサブスクリプションを選ぶ。

```bash
az login
az account show --query "{name:name, state:state}" -o table
```

3. 以降で使う名前を決めて、シェルに入れる（`<…>` は PM が決める。**アプリ名は Azure 全体で重複できない**ので、班の名前などを入れる）。値は秘密ではない。

```bash
export RG=rg-giftia-t501
export PLAN=plan-giftia-free
export LOC=japaneast            # 作る場所。迷ったら東日本
export API_APP=<API用のアプリ名>   # 例: giftia-t501-api  → https://<API用のアプリ名>.azurewebsites.net
export WEB_APP=<画面用のアプリ名>  # 例: giftia-t501-web  → https://<画面用のアプリ名>.azurewebsites.net
```

## 2. リソースを作る（無料のプラン F1 に2つのアプリ）

```bash
az group create --name "$RG" --location "$LOC" -o none
az appservice plan create --name "$PLAN" --resource-group "$RG" --location "$LOC" --is-linux --sku F1 -o none
az appservice plan show --name "$PLAN" --resource-group "$RG" --query "{sku:sku.name, tier:sku.tier}" -o table
```

- 最後の表が `F1` / `Free` でなければ**止める**（`az appservice plan delete` で消して作り直す）。
- 使える実行環境の名前は `az webapp list-runtimes --os-type linux` で見る。次の2行の `PYTHON:3.12`・`NODE:22-lts` が一覧に無ければ、一覧にある近い版に置き換える。

```bash
az webapp create --name "$API_APP" --resource-group "$RG" --plan "$PLAN" --runtime "PYTHON:3.12" -o none
az webapp create --name "$WEB_APP" --resource-group "$RG" --plan "$PLAN" --runtime "NODE:22-lts" -o none
```

- **作成の画面（ポータル）で作る場合**: 「価格プラン」は **Free F1** を自分で選ぶ。「監視」→ Application Insights は **いいえ**。「デプロイ」→ 継続的デプロイ（GitHub Actions）は使わない（zip で配置する）。
- 一覧と価格プランの画面のスクリーンショットを撮る（Issue #132 完了条件 1。ホスト名以外に秘密は映らない）。

## 3. API（FastAPI）を置く

### 3-1. アプリの設定（環境変数の**名前だけ**）

| 名前 | 何を入れるか | 入れ方 |
| --- | --- | --- |
| `GIFTIA_DB_HOST` | 配られた DB のホスト名 | ポータルで入力（下） |
| `GIFTIA_DB_USER` | 配られたアカウントのユーザー名 | ポータルで入力 |
| `GIFTIA_DB_PASSWORD` | 配られたアカウントのパスワード | ポータルで入力（**履歴・画面に残さない**） |
| `GIFTIA_ALLOWED_ORIGIN` | 公開した**画面**の送信元 `https://<画面用のアプリ名>.azurewebsites.net`（末尾の `/` なし・1つだけ。空だと誰も許さない） | CLI でよい（秘密ではない） |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `true`（zip 配置のとき、`requirements.txt` から依存を入れさせる） | CLI |

**使わない名前**: DB 名（`giftia_t501` はコードに固定）、SSL 証明書のファイルや中身を入れる環境変数（certifi を使う。設計 D-33 の案Q）。入れても使われない。

- **DB の3つ（ホスト・ユーザー・パスワード）はポータルで入れる**: Azure ポータル → `<API用のアプリ名>` → 左の「設定」→「環境変数」→「アプリ設定」→「+ 追加」で名前と値を入れ、最後に「適用」→「確認」。画面を人に見せるときは値の表示（目のアイコン）を閉じる。
- CLI で入れる場合は、**値を画面にもシェル履歴にも残さない**ようにする（`az` は設定の一覧を値つきで表示するので、`-o none` が必須）。

```bash
read -r -s -p "DB パスワード: " DBPW; echo
az webapp config appsettings set --name "$API_APP" --resource-group "$RG" --settings GIFTIA_DB_PASSWORD="$DBPW" -o none
unset DBPW

az webapp config appsettings set --name "$API_APP" --resource-group "$RG" -o none --settings \
  GIFTIA_ALLOWED_ORIGIN="https://$WEB_APP.azurewebsites.net" \
  SCM_DO_BUILD_DURING_DEPLOYMENT=true
```

### 3-2. スタートアップコマンド

API の起動は `backend/startup.sh`（uvicorn、`--no-access-log` つき。N-13・D-33）。

```bash
az webapp config set --name "$API_APP" --resource-group "$RG" --startup-file "sh startup.sh" -o none
```

- 公式の Python のページは Gunicorn の例だけで、FastAPI（uvicorn）の例は載っていない（[公式: Python アプリの設定](https://learn.microsoft.com/en-us/azure/app-service/configure-language-python)）。`startup.sh` は `${PORT:-8000}` で待ち受ける（App Service が `PORT` を渡さない場合は 8000）。**つながらなければ「困ったとき」へ。**

### 3-3. 配置用の zip を作って置く（main から）

作業用のフォルダに **main だけ**を取り出す。自分の作業中のクローンからは作らない（未コミットの変更や `.env` が入るのを防ぐ）。

```bash
rm -rf /tmp/giftia-deploy && git clone --depth 1 --branch main git@github.com:Team18-RaizenYomiMukuro-Tech0/model_team18_tech0.git /tmp/giftia-deploy
cd /tmp/giftia-deploy/backend
zip -r ../api.zip . -x ".env" ".env.*" "tests/*" "scripts/*" "__pycache__/*" "*/__pycache__/*" ".venv/*" ".pytest_cache/*" ".ruff_cache/*" ".mypy_cache/*" "requirements-dev.txt"
unzip -l ../api.zip | grep -E "requirements.txt|startup.sh|main.py|\.env"
```

- 最後の確認で `requirements.txt`・`startup.sh`・`main.py` が**zip の一番上**に出て、`.env` が**出ない**こと（`.env.example` は出てよい）。`requirements.txt` が一番上にないと依存が入らない（公式: 「依存ファイルはプロジェクトの根に置く」）。
- zip は**フォルダの中身**を固める（フォルダごとではない。公式: [zip 配置](https://learn.microsoft.com/en-us/azure/app-service/deploy-zip)）。

```bash
az webapp deploy --name "$API_APP" --resource-group "$RG" --src-path ../api.zip --type zip
```

- 2〜数分かかる。終わったら API の確認（手順 6 の ①）へ。

## 4. 画面（Next.js）を置く

画面は**手元でビルドして**、動く形（`.next` と本番用の `node_modules`）を zip にして置く。F1 の CPU（5 分あたり 3 分）でサーバー側のビルドをすると超えやすいので、サーバーではビルドしない（`SCM_DO_BUILD_DURING_DEPLOYMENT` を `true` にしない）。

```bash
cd /tmp/giftia-deploy/frontend
npm ci
npm run build
npm prune --omit=dev
zip -r ../web.zip . -x ".env" ".env.*" ".next/cache/*"
unzip -l ../web.zip | grep -E "package.json|next.config.ts|\.next/BUILD_ID|public/robots.txt|\.env" | head
```

- 確認: `package.json`・`next.config.ts`・`.next/BUILD_ID`・`public/robots.txt` が出る。`.env` は出ない。zip は約 90 MB（手元で測った値）。

```bash
az webapp config set --name "$WEB_APP" --resource-group "$RG" --startup-file "npm start" -o none
az webapp deploy --name "$WEB_APP" --resource-group "$RG" --src-path ../web.zip --type zip
```

- 画面のサーバーは Next.js の `next start`（`npm start`）。App Service が渡す `PORT` で待ち受ける（Next.js は `PORT` を読む。公式: [Node.js アプリの設定](https://learn.microsoft.com/en-us/azure/app-service/configure-language-nodejs) は `PORT` を渡すと書いている）。公式の Node のページには Next.js の記述が無い。
- `API_ORIGIN` などの環境変数は**入れない**（手元の開発用。公開版では使わない）。

## 5. 画面と API をつなぐ（**未決。PM の決定のあと**）

画面が API を呼ぶ先の決定（上の「先に決まっていないこと」）が出るまで実行しない。決まったら、この節を決定に合わせて書き足す（呼び方によって、画面側の設定・`GIFTIA_ALLOWED_ORIGIN` の要否が変わる）。**決まっていないことを、この手順書では補わない。**

## 6. 公開後の確かめ方（Issue #132 の完了条件 2〜6）

`<API>` は `https://<API用のアプリ名>.azurewebsites.net`、`<WEB>` は `https://<画面用のアプリ名>.azurewebsites.net`。**最初の1回は遅い**ので、20 秒ほど待ってからもう一度。

**① API が動いて DB につながる（certifi の SSL を含む）**

```bash
curl -sS -i "<API>/api/health"
```

- `HTTP/2 200` と `x-robots-tag: noindex, nofollow`。DB まで届けば 200、DB につながらなければ 500 `internal_error`（SSL の失敗もここに出る。`certifi` で公開の証明書の束を使うので、サーバーに証明書ファイルは要らない）。

**② 画面が 200**

```bash
curl -sS -o /dev/null -w "%{http_code}\n" "<WEB>/"
```

**③ 検索エンジンに載せない（N-07・D-16）**

```bash
curl -si "<WEB>/robots.txt"          # 200 と本文 User-agent: * / Disallow: /
curl -sI "<WEB>/"                    # x-robots-tag: noindex, nofollow
curl -sI "<API>/api/health"          # x-robots-tag: noindex, nofollow
```

**④ CORS（画面のドメインのときだけ許す。D-16）**

```bash
curl -si -H "Origin: https://<画面用のアプリ名>.azurewebsites.net" "<API>/api/health" | grep -i "access-control"
curl -si -H "Origin: https://example.invalid" "<API>/api/health" | grep -i "access-control"
```

- 1本目は `access-control-allow-origin: https://<画面用のアプリ名>.azurewebsites.net`、2本目は何も出ない。`*` は出ない。

**⑤ API の候補（B3 #60 が入ったあと）**

```bash
curl -sS "<API>/api/candidates?scene=送別&price_band=3000to4999"
```

- 200 で 10 件以内。（B3 が main に入る前は 404。）

**⑥ パスワードがリポジトリに無い（N-04）・ログ（N-13・D-33）**

```bash
cd /tmp/giftia-deploy && git grep -n "GIFTIA_DB_PASSWORD"
```

- 値が無い（名前だけ。`.env.example` の `GIFTIA_DB_PASSWORD=` は値が空）。ポータルの「環境変数」の画面は**値を伏せて**スクリーンショットを撮る。
- 起動コマンドに `--no-access-log` がある（`backend/startup.sh`）。ポータルの「監視」→「診断設定」が**作られていない**ことを画面で見る。

**⑦ 実機（N-11）**: iPhone の Safari と Android の Chrome で共有ページを1回ずつ開く。確認用に作ったリンクの ID を控え、**当日中**に配られたアカウントで手で消す（`DB管理手順.md` の手順 3 の考え方）。

**⑧ 費用（N-08）**: 週に1回、ポータルの「Cost Management」で 0 円か、プランが F1 のままかを見る。予算アラート（例 500 円）を作れるなら作る。

## 7. 止め方・片付け

| いつ | 何を | コマンド |
| --- | --- | --- |
| 一時的に止める | 2つのアプリを止める（リソースは残る） | `az webapp stop --name "$WEB_APP" --resource-group "$RG"` と `az webapp stop --name "$API_APP" --resource-group "$RG"` |
| 再開 | 起動する | `az webapp start --name … --resource-group "$RG"` |
| **12/12 に全部片付ける**（全員で。設計 D-33） | リソースグループごと削除（アプリとプランが消える。**元に戻せない**） | `az group delete --name "$RG" --yes --no-wait` |
| 12/12 に DB を片付ける | `share_links` の削除（DROP）は配られたアカウントで手で | `DB管理手順.md` の手順 4 |

- 削除のあと、ポータルの「リソース グループ」に `rg-giftia-t501` が無いことを見る。

## 困ったとき

| 症状 | 見る所・直し方 |
| --- | --- |
| API が `503` / `Application Error` のまま | ポータル → `<API用のアプリ名>` → 「監視」→「ログ ストリーム」（障害対応のときだけ見る。ログの保存先は**追加でオンにしない**）。`ModuleNotFoundError` なら zip の一番上に `requirements.txt` があるか、`SCM_DO_BUILD_DURING_DEPLOYMENT=true` かを確かめて、手順 3-3 をやり直す |
| API が起動しない（`startup.sh` が見つからない・`uvicorn` が見つからない） | 起動コマンドを直接書く: `az webapp config set --name "$API_APP" --resource-group "$RG" --startup-file "python -m uvicorn main:app --host 0.0.0.0 --port 8000 --no-access-log"`（`--no-access-log` は外さない） |
| `/api/health` が 500 | DB の3つの設定（名前・値の打ち間違い）、配られた DB 側に接続元の制限があるか（運営に確認）。SSL なら `evidence/db/2026-11-08_ssl-certifi.md` のとおり certifi を使う。つながらない場合は設計 D-33 の「案P」へ戻す（god に相談） |
| 画面が `403` や止まる | F1 の 1 日の CPU 60 分／転送 165 MB を超えた可能性。翌日まで待つか、god に相談（有料のプランには**上げない**） |
| 画面の起動が遅い・タイムアウト | F1 は Always On が無く、最初の1回が遅い。もう一度開く |
| CORS で画面から API が呼べない | `GIFTIA_ALLOWED_ORIGIN` が画面の送信元と一字一句同じか（`https://`、末尾の `/` なし、1つだけ）。直したら API アプリを再起動 |

## 手元で確かめた範囲（2026-11-09）

- 画面: `npm ci` → `npm run build` → `npm prune --omit=dev`（`node_modules` は約 328 MB、`.next` は約 27 MB）→ zip は約 90 MB。`PORT=3187 npm start` で起動し、`curl http://127.0.0.1:3187/` が `200`、応答に `X-Robots-Tag: noindex, nofollow`。`next.config.ts` は本番用の `node_modules` だけで読めた。
- API: `backend/startup.sh` で起動し、`/api/health` などの応答に `X-Robots-Tag` が付くこと、CORS が1つの送信元だけを許すことは PR #150 のテストと `evidence/review/O1-132.md` で確認済み。
- **Azure 上では未実行**: F1 の作成、zip 配置、スタートアップコマンド（`sh startup.sh`・`npm start`）、`PORT` の渡され方、F1 の CPU・メモリで足りるか。PM の初回の実行で確かめ、結果をこの手順書に反映する。

## 出典

- [Azure サブスクリプションとサービスの制限（App Service の表）](https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/azure-subscription-service-limits)
- [App Service プランの概要](https://learn.microsoft.com/en-us/azure/app-service/overview-hosting-plans)
- [Python アプリの設定（Linux）](https://learn.microsoft.com/en-us/azure/app-service/configure-language-python)
- [Node.js アプリの設定（Linux）](https://learn.microsoft.com/en-us/azure/app-service/configure-language-nodejs)
- [ZIP 配置](https://learn.microsoft.com/en-us/azure/app-service/deploy-zip)
