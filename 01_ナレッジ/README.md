# ナレッジ運用（自動吸い上げ版）

開発で出たエラー・ミスを **自動で吸い上げ**、記録に残し、二度踏まない仕組みにする。
設計の正本は [[自動吸い上げ設計]]（`自動吸い上げ設計.md`）。

## 仕組みの全体像

```
随時収集 … Bash が失敗した瞬間、hook が _inbox/mistakes.jsonl に1行追記（秘匿マスク済み）
週1要約 … weekly-digest.py が型に束ね、mistakes/・index・deploy-checklist・CLAUDE.md を更新
```

## ファイル

| 場所 | 役割 |
| --- | --- |
| `_inbox/mistakes.jsonl` | 随時の生ログ（**git 管理外**。秘匿情報を含みうる） |
| `mistakes/<型>.md` | 型ごとの記事（発生回数・症状・原因・直し方） |
| `deploy-checklist.md` | ★予防1：デプロイ前の確認リスト（自動更新） |
| `index.md` / `log.md` | 目録と履歴（自動更新） |
| CLAUDE.md の `auto:mistakes` ブロック | ★予防2：繰り返すミスを作業前に提示 |

## 収集の仕掛け

- **随時**: `.claude/settings.json` の PostToolUseFailure hook が `scripts/collect-mistake.py` を呼ぶ。Bash の失敗だけを拾い、マスクして追記する。作業は止めない。
- **CI/デプロイ**（後付け）: Actions/Vercel/Render の失敗ステップから同 jsonl に追記する（CI 導入後）。

## 週1要約の回し方

**主系統（推奨・AI版）**: `/schedule` のクラウドルーティンに `weekly-digest-prompt.md` の本文を登録する。
AI がエラーを**意味で束ね**、原因・直し方まで記入し、ブランチを切って PR を作る（機械版より賢く束ねる）。

**フォールバック（AIを使わない機械版）**:
```bash
python3 scripts/weekly-digest.py
```
コマンド＋エラー先頭行で機械的に束ねる。手早いが、先頭行がブレると型が割れやすい。

## 手で書く還元（任意）

自動収集はエラー起点。設計判断や「やって駄目だった理由」など、エラーに出ない学びは
従来どおり記事として残してよい（`log.md` に `## [YYYY-MM-DD] 還元 | <タイトル>` を追記）。

## 品質の目安

- 3 か月後の自分が読んで再現できるか。「なぜそうしたか」が書かれているか。
- 生ログ（`_inbox/`）が git に乗っていないか。秘匿情報がマスクされているか。
