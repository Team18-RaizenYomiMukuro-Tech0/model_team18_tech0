---
title: エージェントが指定モデルで起動しない再発（原因: roster.json の command）
origin: internal
date: 2026-10-19
source: hive/agents/god/memory.md（2026-10-19「【再発】…」「決定: godモデルは方針A」「切り分け結果(実機)」「【原因確定】モデル指定の正体は roster.json の command」）、roster-backups/
---

# エージェントが指定モデルで起動しない再発（原因: roster.json の command）

対象: hive の全エージェント（god＝りじちょー、およびスタッフ5名）。

## 事象

- god を `claude-opus-5-5` で動かす想定だが、起動のたびに実モデルが `claude-opus-4-8[1m]` に戻っていた。
- ユーザーは `/model claude-opus-5-5` を実行し、ユーザー既定（`~/.claude/settings.json` の `model`）は `claude-opus-5-5` になっていた。それでも再発した。
- スタッフは Sonnet で動かす想定だが、アカウント既定（Opus 5.5）で起動していた。

証拠:

- `hive/cost-ledger.jsonl` 509行: `"agent_id":"god"`, `"session_id":"2a0a9f03-..."`, `"model":"claude-opus-4-8"` で課金。
- `hive/log.jsonl` 72行: `{"kind":"spawn","agentId":"god","isGod":true}`（god はトップレベルで spawn）。

## 根本原因（確定）

- リポジトリ直下の `roster.json` にある各エージェントの `command` が、そのまま起動コマンドになっている。`roster.json` はアプリが数秒ごとに保存し、履歴は `roster-backups/` に残る。
- god の `command` は `claude --model claude-opus-4-8[1m]` に固定されていた。この明示指定が `/model` で保存した既定より優先され、毎回 4.8 に戻っていた。
- スタッフの `command` は `claude` だけだった。そのためアカウント既定（Opus 5.5）で起動していた（Terao 指摘）。
- `.claude/agents/*.md` の `model` frontmatter は、Agent ツールで呼んだサブエージェントにしか効かない。`roster.json` から起動するエージェントには効かない。

## 決定

採用: A（最新版優先）。god は `claude-opus-5-5` を優先し、5.5 に 1M 版が無ければコンテキスト量は諦める（ユーザー承認 2026-10-19）。

## 対策と現状

1. 切り分け（確認済み 2026-10-19）: god セッションで `/model claude-opus-5-5` を実行すると「Set model to `Opus 5.5` and saved as your default for new sessions」と出力され、以後 `claude-opus-5-5` で稼働した。v0.5.0 で 5.5 は選択できる。
2. `roster.json` の修正（2026-10-19、god が実施）: god を `claude --model claude-opus-5-5`、スタッフを `claude --model claude-sonnet-5-5` にし、`model` 欄も同じ値にした。god memory には「8秒後も保持を確認」とある。
3. 修正後の観察（yamapi 確認 2026-10-19T14:23Z）: 稼働中の直接編集は保持されなかった。
   - `roster-backups/` の各ファイルは「その時刻の保存の直前の内容」である（各ファイルの `savedAt` が一つ前のバックアップ時刻と一致する）。
   - `roster-2026-10-19T14-23-28-804Z-40-write.json`: 修正値（god `claude --model claude-opus-5-5`、スタッフ5名 `claude --model claude-sonnet-5-5`）。`savedAt` は 14:22:48.724Z のままなので、god の直接編集は 14:22:48.724Z〜14:23:28.804Z の間に行われた。
   - `roster-2026-10-19T14-23-29-398Z-41-write.json`: `savedAt` 14:23:28.804Z の内容が旧値（god `claude --model claude-opus-4-8[1m]`、スタッフ5名 `claude`）。14:23:28.804Z のアプリ保存で直接編集が上書きされた。
   - 14:23:48Z 時点の `roster.json` も旧値（god の `model` 欄 `claude-opus-4-8[1m]`、スタッフの `model` 欄なし）。
   - アプリは自分が保持している状態で上書き保存するため、稼働中のファイル編集は効かない。
4. 正しい直し方（god memory 追記より。反映は未確認・再起動待ち）:
   - (1) アプリ画面のエージェント設定で、起動コマンド／モデルを変える。
   - (2) アプリを完全に終了してから `roster.json` を編集し、起動し直す。

未確認:

- 上記 (1)(2) で `roster.json` の `command` が修正値のまま保存・起動されるか。
- 再起動後の `hive/cost-ledger.jsonl` の `model`（god は `claude-opus-5-5`、スタッフは `claude-sonnet-5-5` になっているか）。
- `claude-opus-5-5` に 1M コンテキスト版が存在するか。

## 再発防止チェック

- [ ] モデルを変えるときは、まず `roster.json` の各エージェントの `command`（と `model` 欄）を見る。
- [ ] アプリ稼働中に `roster.json` を直接編集しない。アプリ画面の設定で変えるか、アプリを完全終了してから編集して起動し直す。
- [ ] `roster-backups/` の各ファイルは保存直前の内容。時刻を読むときは `savedAt` と合わせて見る。
- [ ] `roster.json` を変えたら、数秒後と次の保存後に `roster-backups/` の最新ファイルで値が残っているかを確認する。1回の確認で「保持」と判断しない。
- [ ] `.claude/agents/*.md` の `model` は Agent ツール経由にしか効かない。`roster.json` から起動するエージェントのモデル変更には使えない。
- [ ] 反映は再起動後。次の `app-start`（`hive/log.jsonl`）後に `hive/cost-ledger.jsonl` の各 `agent_id` の `model` を確認する。
- [ ] 確定事実と見立てを分けて記録する。
