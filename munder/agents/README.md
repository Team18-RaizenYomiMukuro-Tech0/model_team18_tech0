# スタッフ5人の取り込みファイル

Munder Difflin の画面から取り込むと、スタッフ5人（Takahiro・Mi-rin・Terao・Kurosu・yamapi）の枠をそろえられます。ファイルは版で2種類あります。

| 版 | ファイル | 取り込む画面 |
| --- | --- | --- |
| 無料版（Classic） | `*.hire.json`（spec は `munder-difflin/hire@1`） | Add an agent → **import hire…** |
| Pro | `*.agent.json`（spec は `munder-difflin/agent@2`） | Add an agent → 上部の **From a file** |

中身（名前・役割・cast 枠・色・エンジン・モデル・得意分野）は同じです。Classic は hire@1 だけ読むため、別ファイルにしています。Rijicho（りじちょー）は含みません（別途用意。手順は PM に確認）。

## 入っているもの・いないもの
| 入っている | 入っていない |
| --- | --- |
| 名前、役割の1行、見た目の cast 枠、色、エンジン（claude）、モデル（claude-sonnet-5-5）、得意分野、専用 worktree の有無 | 作業フォルダ、鍵・トークン、PC のパス、メール、記憶、口調 ID（questCast）、`.claude/agents/*.md` の本文 |

- 秘密・PC パス・メール・記憶がないことは、書き出し時に `*.agent.json` の全項目を目で確認済み。`*.hire.json` は `*.agent.json` の値を移しただけで、`goal`（「CLAUDE.md と `.claude/agents/<名前>.md` に従う」）以外の項目は増やしていません。
- 口調と人格の詳細は、作業フォルダを**このリポジトリのクローン**にすれば、`CLAUDE.md` と `.claude/agents/<名前>.md` から読まれます（Claude Code の通常動作。取り込み後の実機確認は未実施）。
- 対応する cast 枠・口癖は `munder/cast-mapping.md`。モデルの指定は `CLAUDE.md` の表（Rijicho=Opus、他5人=Sonnet）と同じ。

## 取り込み手順（アプリ 0.5.7。アプリ内の画面文言から。実機では未検証）
手順3だけ版で違います。他は同じです。
1. このリポジトリをクローンしておく。
2. Munder Difflin で **Add an agent** を開く。
3. ファイルを選ぶ。
   - **無料版（Classic）**: フォーム内の **import hire…** を押し、`munder/agents/` の `*.hire.json` を1つ選ぶ。
   - **Pro**: 上部の **From a file** を押し、`munder/agents/` の `*.agent.json` を1つ選ぶ（ダイアログ名は「Open an agent file」）。
4. フォームが埋まる。Pro は追加される内容の一覧も出る。内容を読んで、必要なものだけチェックする。直してもよい。
5. **作業フォルダに、自分のクローン（`model_team18_tech0`）を選ぶ**。ファイルには入っていないので必ず自分で選ぶ。間違えたら自分で直そうとせず、PM に連絡する。
6. **Add agent**（Classic は **spawn**）を押す。押すまで何も始まらない。
7. 残りの4人も同じ手順で繰り返す。
8. 口調（questCast）は取り込みでは入らない。`docs/setup.html` の手順(d)に従って、人ごとに `munder/cast-mapping.md` の slug を選ぶ。

## 未確認
- 無料版（Classic）の **import hire…** で `*.hire.json` が実際に取り込めるか（アプリ内の説明は「.json の hire から、フォームを埋める。spawn を押すまで何も始まらない」。5ファイルはアプリの検証関数を通した。画面での取り込みは確認待ち）。取り込めない場合は `docs/setup.html` の手順(d)のとおり画面で1人ずつ作る。
- Pro の **From a file**（`*.agent.json`）も実機では未検証。
- Windows と Mac で手順が変わるか（ファイル選択ダイアログの見た目以外に差があるか）。Windows 版の起動自体が未確認。
- 取り込み後の作業フォルダの欄の見た目、questCast を選ぶ画面の場所（0.5.7）。

## 作り直し（メンテナ向け）
`*.agent.json` はアプリの書き出しコマンドを使う（鍵・フォルダは入らない）。`--template` は付けない。

```
hive-node "<Munder Difflin の Resources>/md-agent-export.cjs" --agent <id> --parts configs,skills --out munder/agents/<名前>.agent.json
```

書き出したら、`exportedAt` 以外を目で確認し、秘密・PC パス・メール・記憶が無いことを確かめてからコミットする。

`*.hire.json` は `*.agent.json` の `configs`（role→description、character、accent、provider、model、capabilities、isolate）を移し、`goal` を足した手書きの小さなファイル。`author`・`tokenCap`・`skills` は入れない。変えたら、アプリの `validateHireManifest`（必須 name、description 200字以内、provider は claude・antigravity・codex・cursor のどれか、model は英数字と `. _ - ( ) [ ] / : @ +` と空白だけ）に通ることを確かめる。
