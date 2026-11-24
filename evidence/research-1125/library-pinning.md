# ライブラリのバージョン固定と差し替え候補の調査（Issue #705）

調査日: 2026-11-25 / 基準コミット: 3a80be9 / 調査のみ（`package.json`・`package-lock.json`・`requirements*.txt`・アプリのコードは変えていない）

## 1. 結論

- **画面側は「実際に入る版」はすでに固定されている。** 9件すべて `^` の範囲指定だが、`package-lock.json` があり、CI とデプロイはどちらも `npm ci` で入れる。lock と食い違えばエラーで止まる。
- **API 側はほとんど固定されていない。** `requirements.txt` の9行のうち `==` は2行（`jaconv`・`rapidfuzz`）だけ。残り7行は `>=` で、lock も無い。デプロイのたびに最新が入る。
- **いちばん危ないのは API 側。** 本番ビルド（Azure の remote-build）は `requirements.txt` から入れるので、`fastapi` などが main へのマージ時の最新版になる。
- ライセンスで気になるのは、画面側の lock に出る `sharp` の同梱部品（LGPL-3.0）と、Python 側の `certifi`（MPL-2.0）。どちらも今の使い方なら実害は小さい（§5）。

## 2. 画面側（`frontend/`）

lock の版は `package-lock.json`（lockfileVersion 3、400パッケージ）から読んだ。手元に `node_modules` は無い。

| ライブラリ | 区分 | 今の指定 | lock の版 | ライセンス | 最新（lock と同じ系列か） |
| --- | --- | --- | --- | --- | --- |
| next | dependencies | `^16.4.5` | 16.4.5 | MIT | — |
| react | dependencies | `^19.3.1` | 19.3.1 | MIT | — |
| react-dom | dependencies | `^19.3.1` | 19.3.1 | MIT | — |
| @types/node | devDependencies | `^26.6.6` | 26.6.6 | MIT | — |
| @types/react | devDependencies | `^19.3.0` | 19.3.0 | MIT | — |
| @types/react-dom | devDependencies | `^19.3.0` | 19.3.0 | MIT | — |
| eslint | devDependencies | `^9.39.5` | 9.39.5 | MIT | — |
| eslint-config-next | devDependencies | `^16.4.5` | 16.4.5 | MIT | — |
| typescript | devDependencies | `^6.0.3` | 6.0.3 | Apache-2.0 | — |

（最新版の列は、今回ネットワークで確かめていないので「—」。更新の手順で `npm outdated` を使って見る。）

- 範囲指定 9件／固定 0件。ただし lock が全体を固定しているので、`npm ci` で入れる限り版は動かない。
- 間接依存（lock にだけ出る分）は391件。ライセンスの内訳は MIT 318、Apache-2.0 34、ISC 18、LGPL を含む 14、BSD 9、その他 8。

### 画面側の CI・デプロイ

| 場所 | 入れ方 | Node |
| --- | --- | --- |
| `.github/workflows/main_gen13-app-step3-1-5181-fe.yml`（本番デプロイ） | `npm ci` | 24.x |
| `.github/workflows/pr-tests.yml`（PR の検査） | `npm ci`（`cache: npm`、キーは `package-lock.json`） | 22 |

- どちらも `npm install` は使っていない。lock が壊れたり、`package.json` と食い違ったりすれば CI で止まる。これは良い状態。
- **食い違い:** 検査は Node 22、本番は Node 24。「検査では通ったが、本番の Node では違う動き」が起こり得る。`next` の要求は `>=20.9.0` なので、どちらでも動く。

## 3. API 側（`backend/`）

手元の Python は 3.11.0 で、`requirements.txt` の環境は入っていない。**実際に入る版を示す lock が無い**ので、下の「最新の版」は PyPI で見た 2026-11-25 時点の最新で、「もし今デプロイしたら入る版」の目安。

| ライブラリ | 今の指定 | 固定？ | 最新の版 | ライセンス | 使っている場所 |
| --- | --- | --- | --- | --- | --- |
| fastapi | `>=0.115` | 範囲 | 0.165.0 | MIT | `api/*`・`main.py`・`publish.py` |
| uvicorn | `>=0.30` | 範囲 | 0.54.0 | BSD-3-Clause | 起動・計測のみ（`perf/measure.py`） |
| python-dotenv | `>=1.0` | 範囲 | 1.2.4 | BSD-3-Clause | `main.py`・`database.py` |
| pymysql | `>=1.1` | 範囲 | 1.2.4 | MIT | `database.py`・`db.py` |
| cryptography | `>=42` | 範囲 | 50.0.2 | Apache-2.0 OR BSD-3-Clause | 直接は使っていない（pymysql の認証用と思われる。**要確認**） |
| certifi | `>=2024.2.2` | 範囲 | 2026.11.20 | MPL-2.0 | `database.py`（DB への TLS 接続の証明書） |
| azure-functions | `>=1.20` | 範囲 | 2.4.0 | MIT | `function_app.py` |
| jaconv | `==0.5.0` | **固定** | 0.5.0 | MIT | `search.py` |
| rapidfuzz | `==3.14.6` | **固定** | 3.14.6 | MIT | `search.py` |

`requirements-dev.txt`（本番には入れない）:

| ライブラリ | 今の指定 | 固定？ | 最新の版 | ライセンス |
| --- | --- | --- | --- | --- |
| （`-r requirements.txt`） | 上の9件 | — | — | — |
| pytest | `>=8` | 範囲 | 9.2.0 | MIT |
| httpx | `>=0.27` | 範囲 | 0.28.1 | BSD-3-Clause |
| ruff | `>=0.6` | 範囲 | 0.17.6 | MIT |
| mypy | `==2.4.1` | **固定** | 2.4.1 | MIT |

- 本番ライブラリ: 範囲7／固定2。開発用: 範囲3／固定1。全体で範囲10／固定3。
- `fastapi` は 0.115 → 0.165 と大きく動く。0.x の間は、マイナー版の上げで互換が崩れることがある。`>=` はこれを許してしまう。
- `azure-functions` 2.4.0 は Python 3.13 以上を要求する（PyPI の表示）。本番は 3.14 なので入るが、PR の検査は Python 3.12。**検査と本番で、同じ `>=` が別の版に解決される可能性がある。**

### API 側の CI・デプロイ

| 場所 | 入れ方 | Python |
| --- | --- | --- |
| `main_func-gen13-step3-5181.yml` の build ジョブ | `pip install -r requirements-dev.txt`（テスト用） | 3.14 |
| 同 deploy ジョブ | `Azure/functions-action` に `remote-build: true`。Azure 側が `requirements.txt` から入れる | 3.14 |
| `pr-tests.yml` | `pip install -r backend/requirements-dev.txt`（`cache: pip`） | 3.12 |
| `pages.yml` | `pip install markdown==3.7`（`==` で固定済み。文書ページ用） | 3.12 |

- **テストした版と本番に入る版が別になり得る。** テストは build ジョブの `pip install` の結果、本番は後からの remote-build の結果。`>=` のままだと、この2回の間に新版が出れば食い違う。
- `pr-tests.yml` は Python 3.12、本番は 3.14。上と同じ心配がある。

## 4. 固定の方法の案

### 案 A（おすすめ）: 画面は今のまま、API に `==` と lock 代わりの制約ファイルを足す

**画面側**
- `package-lock.json` を正本にする。今の運用（`npm ci`）を続ける。`package.json` の `^` は直さなくてよい（lock が固定している）。
- 「`npm install` を打つと lock が変わる」ことをチームに周知する。依存を更新する PR 以外では lock を変えない。
- 更に厳しくするなら `.npmrc` に `save-exact=true` を置く。今後入れるものは `^` が付かなくなる。

**API 側**
- `requirements.txt` の `>=` を `==` に変える。版は「今 CI で通っている版」に合わせる（本番の版は Azure から読めないので、CI の `pip freeze` の結果を使う）。
- 間接依存まで固定したい場合は、`requirements.in`（今の `>=` の一覧）から `pip-compile --generate-hashes`（pip-tools）または `uv pip compile` で `requirements.txt` を生成する。ただし新しい道具を入れることになるので、運営への相談が要る。
- 当面は道具を足さず、`pip freeze` の出力から直接依存の9件だけを `==` にする方法でも十分。

**更新の手順と頻度（案）**
1. 月に1回、またはセキュリティ通知があった時に、専用の PR を1本立てる。
2. 画面: `npm outdated` で見て、`npm update <名前>` または `npm install <名前>@<版>`。`next` と `eslint-config-next` は同じ版にそろえる。
3. API: `pip list --outdated` で見て、`requirements.txt` の `==` を書き換える。
4. 1つずつ上げ、CI（pytest・mypy・ruff・frontend test/lint/typecheck/build）が通ったら main へ。
5. 一度に何件も上げない（壊れた時に原因が絞れなくなる）。

**理由:** 画面側は追加作業がほぼ無い。API 側は「テストした版＝本番の版」にでき、`fastapi` の 0.x 更新で突然壊れる事故を防げる。道具を足さない形から始められる。

### 案 B: 画面も `package.json` を `^` なしの完全固定にする
- `^` を外して `"next": "16.4.5"` のようにする。lock と二重になるが、`package.json` を見るだけで版が分かる。
- 欠点: 更新で `package.json` の書き換えが毎回要る。lock が既にあるので、得られる安全は小さい。

### 案 C: Dependabot / Renovate で自動 PR
- 週1回などで更新 PR を自動で立てる。`.github/` にはまだ無い。
- 欠点: 設定ファイルと外部サービスの追加になる。**運営への相談が要る**（CLAUDE.md の「追加の外部サービス」「GitHub 基線」）。今回は案を挙げるだけ。

### 本番の Node / Python の固定
- Node は `24.x`、Python は `3.14` と、マイナー以下は動く指定。`engines` を `package.json` に書く／`.nvmrc` を置く案もあるが、今回は変えない。
- 検査（Node 22／Python 3.12）と本番（Node 24／Python 3.14）をそろえる案も、別の Issue で扱うのがよい。

## 5. ライセンスで気になるもの

| 対象 | ライセンス | 気にする点 | 判断 |
| --- | --- | --- | --- |
| `@img/sharp-libvips-*`（10件）、`@img/sharp-win32-*`、`@img/sharp-wasm32`（`next` の画像最適化 `sharp` の任意依存） | LGPL-3.0-or-later（一部は Apache-2.0 / MIT との併記） | LGPL は、改変して配る時にソースの提供などの条件がある | 動的リンクの部品を、改変せず使うだけなので影響は小さいと考えられる（**法務判断ではない**）。 |
| `certifi`（API） | MPL-2.0 | ファイル単位のコピーレフト。改変して配る時だけ関係 | そのまま使うだけなので問題は小さい。 |
| `axe-core`（lint 用、dev） | MPL-2.0 | 同上 | 本番には入らない。 |
| `caniuse-lite`（データ） | CC-BY-4.0 | 表示の義務（出典） | ブラウザ向けデータ。配布物に出典を載せる必要があるかは、公開の段で確認。 |
| `argparse`（dev）／`minimatch`（dev）／`tslib`／`language-subtag-registry` | Python-2.0／BlueOak-1.0.0／0BSD／CC0 | 許容的 | 問題なし。 |

- GPL・AGPL のようなライセンスは、画面側の lock 全体と API 側の直接依存のどちらにも見当たらなかった。
- API 側の間接依存（`fastapi` の下の `starlette`・`pydantic` など）のライセンスは、手元に環境が無く今回は確かめていない。

## 6. 将来差し替えられそうなライブラリの候補

差し替えの難しさは、そのライブラリが「どれだけコードに散らばっているか」で決まる。

| 今のライブラリ | 差し替え候補 | 理由 | 難しさ |
| --- | --- | --- | --- |
| `jaconv`（全角・半角、かな変換。`search.py` のみ） | 標準の `unicodedata.normalize("NFKC")` と、必要なかな変換の自前関数 | 使い方が検索の正規化1か所だけ。`0.5.0` は更新が止まり気味で、外部に頼る意味が薄い | **低**。`search.py` の1か所とテストで済む |
| `rapidfuzz`（あいまい検索。`search.py` のみ） | `difflib`（標準）。または DB 側の検索 | 件数が少なければ標準で足りる可能性。ただし速度は落ちる | 中。速度の確認が要る |
| `python-dotenv`（`.env` 読み込み） | 標準の `os.environ` のみ。本番の App Service / Functions は環境変数が直接入る | 本番では `.env` を使わない。手元用だけの依存 | **低**。2か所（`main.py`・`database.py`） |
| `uvicorn`（サーバー起動） | `hypercorn`、または Functions 経由のみ | 本番は Azure Functions なので、`uvicorn` は手元と計測用 | 低 |
| `pymysql`（DB 接続） | `mysqlclient`、`mysql-connector-python`、ORM（SQLAlchemy） | 純 Python で入れやすい反面、速度は劣る。DB を替える時に影響が大きい | 中〜高。`database.py`・`db.py` に集まっている |
| `fastapi` | Flask、Starlette 直 | ルーターが `api/*` に広く散らばる | **高**。差し替えるより固定して守る方が現実的 |
| `azure-functions` | （Azure を替える時のみ） | `function_app.py` が窓口の1枚 | 低〜中。窓口が1枚なので隔離できている |
| `next` / `react` | Vite + React Router、Remix など | 画面全体が `next/image`・`next/link`・`next/navigation` に依存（それぞれ13・11・7か所） | **高**。差し替えない前提で固定する |
| `eslint` / `eslint-config-next` | Biome、oxlint | 速さと設定の少なさ。ただし Next 用の規則が減る | 低（lint だけ。本番に影響しない） |
| `ruff` / `mypy`（API の検査） | `pyright` | 型検査の好み。`mypy --strict` が通っている現状を壊さない | 低 |

**ざっくりの方針:** 差し替えが簡単なもの（`jaconv`・`python-dotenv`・`eslint` 系）は「必要になったら替える」でよい。`next`・`react`・`fastapi` は差し替えより「版を固定して、更新をゆっくり確かめる」を優先する。

## 7. 今回の調査で分からなかったこと

- API の本番に今入っている版。Azure の環境から `pip freeze` を取らない限り、`>=` の結果は読めない。固定の PR を作る前に、PM が Azure のログまたは Kudu で確かめる必要がある。
- API 側の間接依存のライセンス。
- `cryptography` が実際に必要か（外すと `pymysql` の認証が通らなくなる可能性があるので、触らない）。
- 画面側の最新版。ネットワークで `npm outdated` を打っていない。
