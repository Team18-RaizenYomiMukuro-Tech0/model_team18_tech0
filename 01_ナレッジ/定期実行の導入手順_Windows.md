---
title: 定期実行の導入手順（Windows）
type: knowledge
origin: internal
tags: [scheduled, windows, digest, hooks]
created: 2026-10-27
updated: 2026-10-27
---

# 定期実行の導入手順（Windows）

Windows の PC で、Mac と同じ3つの自動化を使えるようにする手順。**Windows 実機では動かしていない（未検証）**。うまくいかないところが出たら、画面とログ（秘匿値を消したもの）を PM に見せてほしい。

| 自動化 | Windows での扱い |
| --- | --- |
| 週1要約の定期実行 | タスクスケジューラ + `run-digest.ps1`（この手順書） |
| 失敗の自動吸い上げ | Claude Code の hook。`.claude/settings.json` が Windows でも動く形になっている（§2） |
| 秘密情報を止める pre-commit | Git for Windows 付属の sh で動く。`git config core.hooksPath .githooks` を1回実行（§2） |
| PR の自動レビュー | クラウドのルーチン。OS に関係ない。[[レビュールーチンの設定手順]] |

Mac 版は [[定期実行の導入手順]]。決定の根拠: 2026-10-26「各自PCで週1・PRで集約／OS定期実行／生ログはPC外に出さない」。

## 0. 先に知っておくこと
- 以下のコマンドは **PowerShell**（スタートメニューで「PowerShell」と入力して開く）に貼る。**管理者として実行はしない**（通常の起動でよい）。
- `<REPO>` はこのリポジトリを clone したフォルダ（例: `C:\Users\you\GitHub\model_team18_tech0`）。コマンドの前に `cd <REPO>` を実行しておく。
- `claude -p` はトークンを使う。要約は `01_ナレッジ/_inbox/mistakes.jsonl` が空なら起動しない。

## 1. 前提ソフトと確認コマンド
| ソフト | 入れ方（例） | 確認コマンド | 期待する出力 |
| --- | --- | --- | --- |
| Git for Windows | https://git-scm.com/download/win | `git --version` | `git version 2.xx` |
| Python 3 | https://www.python.org/downloads/ （インストーラの「Add python.exe to PATH」にチェック） | `python --version`（または `py --version`） | `Python 3.xx` |
| GitHub CLI | https://cli.github.com/ | `gh --version`、`gh auth status` | バージョンと「Logged in」 |
| Claude Code | https://code.claude.com/docs/ のインストール手順 | `claude --version` | バージョン |

- 4つとも確認コマンドが通ってから次へ。`claude` を一度対話で起動してログインしておく。
- Microsoft Store の「python」だけがある場合（`python --version` がストアを開く）は、python.org の Python を入れて、「設定 → アプリ → アプリの実行エイリアス」で `python.exe` / `python3.exe`（App Installer）をオフにする。

## 2. 1回だけやる設定
```powershell
cd <REPO>
git config core.hooksPath .githooks
git config core.hooksPath
```
2行目の出力が `.githooks` なら、コミット時に `.env` やキーらしき文字列を止めるフックが有効。

失敗の自動吸い上げ（Claude Code が Bash の失敗を `01_ナレッジ/_inbox/mistakes.jsonl` に記録する hook）は、`.claude/settings.json` が `python3` → `python` → `py` の順に、実際に動くものを探して使う。Mac はこれまでどおり `python3` が使われる。Windows では Claude Code が hook を Git Bash で動かす前提（Git for Windows を入れていれば通常そうなる。見立て・未検証）。UTF-8 で読むよう環境変数 `PYTHONUTF8=1` も付けている。

## 3. `-DryRun` で試す（登録前）
```powershell
cd <REPO>
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\scheduled\run-digest.ps1 -DryRun
Get-ChildItem $env:LOCALAPPDATA\munder-scheduled | Sort-Object LastWriteTime -Descending | Select-Object -First 3
Get-Content (Get-ChildItem $env:LOCALAPPDATA\munder-scheduled\digest-*.log | Sort-Object LastWriteTime -Descending | Select-Object -First 1) -Encoding UTF8
```
- ファイル・git・gh は一切変更しない（許可は `Read/Glob/Grep` のみ）。出力は画面ではなくログに出る。
- 「今週は記録なし」と出て終わるのは正常（`_inbox/mistakes.jsonl` が空か無い）。試すだけなら、Claude Code で `git nope` のような失敗するコマンドを1回走らせると記録が作られる。
- ログが想定どおりなら次へ進む。

## 4. 登録・状態確認・解除
```powershell
cd <REPO>
# 登録（毎週月曜 09:00。同名があれば上書き）
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\scheduled\register-digest-task.ps1 -Action Register
# 状態確認（次回実行時刻・前回の結果）
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\scheduled\register-digest-task.ps1 -Action Status
# 今すぐ1回走らせる
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\scheduled\register-digest-task.ps1 -Action RunNow
# 解除
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\scheduled\register-digest-task.ps1 -Action Unregister
```
- タスク名は `MunderDigest`。管理者権限は要らない（自分のユーザーのタスクとして、ログオン中だけ動く設定）。
- PC が月曜 09:00 に起きていなかったときは、起きたあとに1回走る（`StartWhenAvailable`）。
- タスクスケジューラの画面（「タスク スケジューラ」アプリ → タスク スケジューラ ライブラリ）でも `MunderDigest` が見える。

## 5. 許可ツールと限界
Mac 版と同じ（[[定期実行の導入手順]] の「許可ツール」の節）。`--dangerously-skip-permissions` は使わない。Windows 版の違いは次のとおり。
- 作業ツリーは `%LOCALAPPDATA%\munder-scheduled\digest-worktree-*` に作り、終わったら `git worktree remove` する。
- 許可パターンの中のパスは、Git Bash が読める `C:/Users/you/...`（`/` 区切り）で書く。
- プロンプトは引数ではなく標準入力で渡す（複数行・引用符・日本語がコマンドライン引数で壊れるのを避けるため）。

## 6. ログの場所
- スクリプトのログ: `%LOCALAPPDATA%\munder-scheduled\digest-*.log`（実行ごとに1ファイル。`explorer $env:LOCALAPPDATA\munder-scheduled` で開く）
- 生ログ（`_inbox/`）はこの PC の中だけに置く。PC の外へ出さない。ログには秘匿情報を書かない設計だが、共有前に目で確認する。ユーザー名を含むパス（`C:\Users\名前`・`C:/Users/名前`・Git Bash の `/c/Users/名前`・WSL の `/mnt/c/Users/名前`）は、フックが `<user>` に置き換えて記録する。それ以外の書き方が残っていないか、共有前に目で確認する。

## 7. よくあるつまずき
| 症状 | 原因の見立て | 直し方 |
| --- | --- | --- |
| 「このシステムではスクリプトの実行が無効」 | PowerShell の実行ポリシー | 上のコマンドのとおり `-ExecutionPolicy Bypass -File ...` を付けて起動する（この起動1回だけ有効。PC の設定は変えない）。`.ps1` をダブルクリックで動かさない |
| `claude` / `gh` / `git` が見つからない（ログに出る） | タスク実行時の PATH が違う | `run-digest.ps1` の先頭近くの `$env:PATH = ...` に、`Get-Command claude` で出た場所のフォルダを足す |
| `python` を打つとストアが開く | ストアのエイリアス | §1 の最後の注意。`py --version` が通ればそれでもよい（hook は `py` も探す） |
| 日本語が文字化けする | 文字コード | ログは `Get-Content ... -Encoding UTF8` で開く。メモ帳で開くときは UTF-8 を選ぶ |
| フォルダ名に日本語・空白があるパス | クローン先が `C:\Users\山田 太郎\...` など | 動かないときは `C:\work\model_team18_tech0` のような半角英数字だけのパスに clone し直す（見立て・未検証） |
| `locked: ... (already running)` で終わる | 前回の実行が途中で止まりロックが残った | 走っていないことを確認して `Remove-Item -Recurse $env:LOCALAPPDATA\munder-scheduled\digest.lock` |
| タスクは登録できたが走らない | スリープ中／ログオフ中 | ログオン中でないと走らない。`-Action Status` の `LastTaskResult` を見る（0 が成功） |
| 改行コードの警告（`LF will be replaced by CRLF`） | Git の自動変換 | 警告だけなら無視してよい。`.sh` が動かないときは `git config core.autocrlf input` にしてから clone し直す |

## 未検証の点（まとめ）
- Windows 実機で、`run-digest.ps1`・`register-digest-task.ps1`・タスクの実行・hook・pre-commit のどれも動かしていない。PowerShell の構文チェックもこの作業環境では実行できなかった（読み合わせのみ）。
- Windows 版 `claude` が Bash ツールを Git Bash で動かす前提のパス表記（`/` 区切り）。
- hook を Git Bash で動かす前提（PowerShell が既定になっている環境では `for ... do` の書き方が動かない）。

## 動作確認チェックリスト
導入が終わったら、上から順に実行して「結果」を ○／× で記録する。**Windows 実機での確認はまだ誰もしていない**ので、このチェックリストの結果が最初の実機の証拠になる。× が付いた行は、§7 のつまずき表を見てから、それでも直らなければ PM に見せる。

| # | 確認すること | コマンド（PowerShell・`<REPO>` で実行） | 期待する表示 | 結果 |
| --- | --- | --- | --- | --- |
| 1 | Git が入っている | `git --version` | `git version 2.` で始まる | |
| 2 | Python が入っている | `python --version`（通らなければ `py --version`） | `Python 3.` で始まる（ストアが開く・何も出ないは ×） | |
| 3 | GitHub CLI にログイン済み | `gh auth status` | `Logged in to github.com` を含む | |
| 4 | Claude Code が入っている | `claude --version` | バージョン番号が出る | |
| 5 | pre-commit が有効 | `git config core.hooksPath` | `.githooks` | |
| 6 | pre-commit が `.env` を止める | `New-Item .env -Value 'X=1' ; git add -f .env ; git commit -m test` のあと、必ず `git restore --staged .env ; Remove-Item .env` | コミットが失敗し `[pre-commit] .env ファイルはコミットできません` が出る（コミットは作られない） | |
| 7 | 週1要約の試し実行（`-DryRun`）が成功 | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\scheduled\run-digest.ps1 -DryRun` のあと、§3 のログ表示コマンド | ログに `digest start` が出て、エラーで終わっていない（`今週は記録なし` で終わるのも ○） | |
| 8 | タスクが登録済み | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\scheduled\register-digest-task.ps1 -Action Status` | `NextRunTime` が次の月曜 09:00、`状態: Ready` | |
| 9 | hook の記録スクリプトが動く（単体） | `'{"tool_name":"Bash","hook_event_name":"PostToolUseFailure","tool_input":{"command":"ls nope"},"error":"test"}' \| python scripts\collect-mistake.py` のあと `Get-Content 01_ナレッジ\_inbox\mistakes.jsonl -Tail 1 -Encoding UTF8` | `"command": "ls nope"` を含む1行が出る。確認後、その行は消してよい（試し記録が週1要約に混ざらないように） | |
| 10 | hook が Claude Code の失敗を記録する | Claude Code をこのリポジトリで起動し、「`git nope` を実行して」と頼む（失敗するコマンド）。そのあと #9 の `Get-Content` を実行 | `"command": "git nope"`（または同等の失敗コマンド）を含む行が増えている | |

- #9 と #10 の両方が ○ なら、`.claude/settings.json` の hook（`python3` → `python` → `py` の探索）が動いている。#9 だけ ○ で #10 が × なら、Claude Code が hook を Git Bash で動かしていない可能性があるので、そのまま PM に報告する。
- #8 は登録していない人は ×（先に §4）。
- 結果の返し方（決まり。PM 決定 2026-10-27）: GitHub に Issue を1つ作り、タイトルは `導入確認: <GitHub名> (Windows)`（例: `導入確認: re-ji-tech0 (Windows)`）にする。本文に貼るのは、上の表の「結果」列（○／×）だけ。ログ全文や、ユーザー名を含むパスは貼らない。× の行は番号だけ書き、詳細は PM に聞かれたときに、ユーザー名・キー・トークンを消して見せる。
