# #303 本番の確かめ（読むだけ。手順 3 の 1〜8 と 10）

- 日: 2026-11-17。実行: Kurosu（PM 11/17 の選択「Kurosu が読むだけの確認」）。起点: main `6e8d17f`。
- **GET（と HEAD・OPTIONS）だけ**。共有リンクの作成・計測の POST・いいねは打っていない。DB・`.env`・Azure の設定には触れていない。手順 9 と DB の控え・テスト行の削除は PM。
- URL は `<APIの URL>`（API の Functions）・`<画面の URL>`（画面の App Service）と伏せる。出力の DB 名も `<DB 名>` と伏せた。

| 順 | 確かめ | コマンド | 出力の最後の行 | ○× |
| --- | --- | --- | --- | --- |
| 1 | デプロイ | `gh run list -w main_func-gen13-step3-5181.yml -L 2` と `-w main_gen13-app-step3-1-5181-fe.yml -L 2` | API: success（`7d336a4`・`7f14dc2`）、画面: success（`ac601b6`・`6839ba4`）。いずれも最新 2 本とも success。画面の「Verify production serves the new build」は Actions の画面では見ていない（実行全体が success） | ○ |
| 2 | API が生きている | `curl -s -w "\n%{http_code}\n" <APIの URL>/api/health` | `{"status":"ok","db":"<DB 名>","tables":10}` ／ `200`。`tables` 10 ＝ 既存 7＋`share_links`（8）＋`share_likes`・`usage_events`（2）。作成前の控え（8）より 2 増えている | ○ |
| 3 | 候補（第2弾の項目） | `curl -s -w "\n%{http_code}\n" "<APIの URL>/api/candidates?scene=送別"` | `200`。10 件すべてに `reason`・`arrives_on`・`scene_count` がある（1 件目: `reason`「職場の送別で43回選ばれていて、評価も4.7（120件）と高めです。…」、`arrives_on` 2026-11-20、`scene_count` `{"scene":"送別","n":43}`） | ○ |
| 4a | 絞り込み | `curl -s -o /dev/null -w "%{http_code}\n" "<APIの URL>/api/products?scene=お礼&sort=price_asc"` | `200` | ○ |
| 4b | 0 件の `relax` | `curl -s -w "\n%{http_code}\n" "<APIの URL>/api/products?q=zzqxjv"` | `{"items":[],"count":0,"total":0,"page":1,"page_size":12,"relax":{"price_band":null,"category":null,"no_q":7762}}` ／ `200`。条件（送別・3,000円未満・酒類・語）を重ねた 0 件も `relax` が付く（`{"price_band":0,"category":0,"no_q":0}`） | ○ |
| 4c | 不正な並び | `curl -s -w "\n%{http_code}\n" "<APIの URL>/api/products?sort=xxx"` | `{"error":{"code":"invalid_sort",…}}` ／ `422` | ○ |
| 5 | 詳細 | `curl -s -o /dev/null -w "%{http_code}\n" "<APIの URL>/api/products/G5022?scene=誕生日"` | `200` | ○ |
| 6 | 第1弾の共有ページ | `curl -s -w "\n%{http_code}\n" "<APIの URL>/api/share-links/<ID>"` | **既存の共有リンクの ID が文書・手順に無く、作らない約束のため、本物のリンクでは確かめていない**。形式だけ合うダミーの ID では `{"error":{"code":"not_found",…}}` ／ `404`（500 ではない） | －（未実施。PM が手順 9 で作るリンクで確かめる） |
| 7 | 検索に載らない（D-16） | `curl -sI <画面の URL>/` と `curl -s -w "\n%{http_code}\n" <画面の URL>/robots.txt` | `X-Robots-Tag: noindex, nofollow`、robots.txt は `User-agent: *` ／ `Disallow: /` ／ `200` | ○ |
| 8 | API を呼べるのは画面だけ（D-16・#65） | `curl -s -D- -o /dev/null -H "Origin: https://example.com" <APIの URL>/api/health`（GET）と、OPTIONS（`Access-Control-Request-Method: GET`） | GET: `200`、`Vary: Origin` のみ。OPTIONS: `204`、`access-control-allow-origin` なし。どちらも `access-control-allow-origin` は付かない（手順書の `curl -I` は HEAD なので `405`。ヘッダーは付かない） | ○ |
| 10 | 速さ（NF-54。新基準 #403） | 各回の秒と `nth`・`up` を記録する GET だけのスクリプト（10 回・温めなし）。起点 main `25e6782`。詳細だけ #405 の後（main `2002d58`）に測り直し | 新基準（起動したて以外の遅い方から 2 番目が基準以内、起動したては 6 秒以内）で、候補（価格帯なし）1.435 秒・候補（3,000〜4,999円。測り直し）1.255 秒・絞り込み（条件なし）1.749 秒・絞り込み（送別＋価格帯）1.231 秒・**詳細 0.308 秒（測り直し。起動したては最大 3.544 秒）がすべて ○**。詳しくは `NF-54.md` | ○ |

## 補足
- 手順 10 は午前に旧基準で測り、候補（価格帯なし）・絞り込み（条件なし）が × だった。#403 の新基準・#404 の後に測り直した結果が上（詳細は午前は `Server-Timing` が無く ×、#405 の後に測り直して ○）。旧基準の値は `NF-54.md` の末尾。
- 計測は手元の Mac から。Python は 3.11、証明書は `SSL_CERT_FILE=/etc/ssl/cert.pem`（既定のままだと証明書の検証で止まる）。
