# docs/ の案内

`docs/` は、人が読む資料と、GitHub Pages で公開するページの置き場です。アプリのコードは入っていません（コードは `frontend/` と `backend/`）。

## docs/ の中身

| 場所 | 何があるか |
| --- | --- |
| `hub.html`・`index.html` | 開発ハブ。ルール・ナレッジ・モック・5文書への入口。`index.html` はハブへ移動するだけのページ。 |
| `overview.html` | 開発の全体像。 |
| `setup.html` | セットアップガイド。 |
| `hub-assets/` | ハブの見た目（CSS・JS・アイコン）。 |
| `kb/` | 講義の読み物。いまは `dev-system.html`（「講義：この開発の仕組み」）の 1 本と、その見た目と雛形。 |
| `mock/` | 完成イメージ（モック）と図。`mock/clickable/giftia-ui-renewal/` がクリックで動くモック、`mock/diagrams/giftia-ui-renewal/` が流れ図、`mock/screenshots/` が画面の画像。置き方は `mock/README.md`。 |
| `pdf/` | ケースの要件 PDF（`giftia-youkyu-v2.0.pdf`、`giftia-youken-v2.1.pdf`）。 |

`docs/` の手書きページは、そのまま GitHub Pages に公開されます（`.github/workflows/pages.yml`）。このため、`docs/` には架空データだけを置き、秘匿値を入れません（`00_ルール/開発フロー.md` §6）。

## 5文書はどこにあるか

5文書は `docs/` の中ではなく、`02_プロジェクト/giftia-ui-renewal/` にあります。書くのは `.md` だけで、読みやすい HTML は Pages のビルドで作られます（`scripts/build-docs5.py`。HTML はコミットしません）。公開側では、ハブの 5文書のリンク（`docs5/`）から開けます。

| 文書 | ファイル |
| --- | --- |
| 要求 | `02_プロジェクト/giftia-ui-renewal/要求.md` |
| 要件 | `02_プロジェクト/giftia-ui-renewal/要件.md` |
| 仕様 | `02_プロジェクト/giftia-ui-renewal/仕様.md` |
| 設計 | `02_プロジェクト/giftia-ui-renewal/設計.md` |
| テスト設計 | `02_プロジェクト/giftia-ui-renewal/テスト設計.md` |

同じ場所に、決定の記録 `ADR.md`、実装計画 `IMPLEMENTATION_PLAN.md`、`テスト実行手順書.md`、独立評価などの証拠 `evidence/` があります。

## ナレッジはどこにあるか

ナレッジは 2 か所にあります。役割が違います。

| 場所 | 中身 | 書き方 |
| --- | --- | --- |
| `01_ナレッジ/` | この案件の決定と学び（`2026-11-15…の決定の記録.md` など）、失敗の型（`mistakes/` に 21 本）、デプロイ前の確認リスト、定期実行の導入手順。入口は `index.md` と `README.md`。 | Markdown。週1要約が `mistakes/`・`index.md`・`deploy-checklist.md` を自動で更新する。 |
| `docs/kb/` | 開発の進め方を説明する講義の読み物（HTML）。案件の決定は入っていない。 | 手書きの HTML。ハブとセットアップガイドから開く。 |

2 か所を 1 か所にまとめるかどうかは、まだ決めていません（PM に確認中）。

## ルールはどこにあるか

`00_ルール/` に、作業ルール・開発フロー・PR レビュー規定・Issue 作成規定があります。まず `00_ルール/開発フロー.md` を読んでください。

リポジトリ全体の案内は、ひとつ上の `README.md` にあります。
