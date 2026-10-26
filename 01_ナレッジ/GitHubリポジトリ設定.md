# GitHub リポジトリ設定（Team18）

リポジトリ: `Team18-RaizenYomiMukuro-Tech0/model_team18_tech0`（public・テンプレート・MIT）。設定日 2026-10-26。
レビューとマージの決まりは `00_ルール/PRレビュー規定.md`。

## 期限のある設定（要更新）
| 設定 | 期限 | 切れると | 更新方法 |
| --- | --- | --- | --- |
| Interaction limits（共同編集者のみ） | **2027-04-26** | 外部の人が PR・Issue・コメントを出せるようになる | Settings → Moderation options → Interaction limits で「Limit to repository collaborators」を再設定（最長6か月） |

## main の保護（ルールセット `main-protection`）
- PR 必須・本人以外の承認1件・新しい push で承認を取り消し・squash マージのみ
- `main` の削除と force push は禁止
- 例外: チーム `members` は PR 経由なら承認なしでマージできる（直接 push は不可）。自分でマージしてよい範囲は PR レビュー規定の 5. に従う

## その他の設定
- マージ後に作業ブランチを自動削除
- Secret scanning と push protection、Dependabot alerts を有効化
- Actions の `GITHUB_TOKEN` は読み取りのみ。外部からの PR でワークフローを動かすときは毎回承認が必要
- ラベル: `needs-human`・`ai-review:doing`・`ai-approved`

## メンバーと権限
- Organization: `Team18-RaizenYomiMukuro-Tech0`（Free）。管理者は `Hiroki0023`
- チーム `members`（書き込み権限）: `Hiroki0023`・`re-ji-tech0`・`matsuki24335`
- CODEOWNERS は役割が決まってから入れる

## 学び
- ルールセットは push の後に入れる。先に入れると最初の push 自体が拒否される。
- 個人アカウントのリポジトリでは権限が「オーナー／共同編集者」の2段階しかなく、自分でマージする例外をオーナー以外に付けられない。全員で同じ条件にするなら Organization を使う。
- Claude の承認は、その Claude を動かしている人の名前で記録される。「重要な変更は人が見る」は設定では強制できず、レビュー規定で守る。
