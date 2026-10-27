# 週1要約（無人実行・Windows 版）。タスクスケジューラから呼ぶ。手動の動作確認は -DryRun。
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\scheduled\run-digest.ps1 [-DryRun]
# run-digest.sh（Mac 版）と同じ動作。許可ツールは下の $Allowed に限る。--dangerously-skip-permissions は使わない。
# 生ログ 01_ナレッジ/_inbox/ はコミット・push しない（.gitignore 済み。git add は 01_ナレッジ/ 配下の指定ファイルのみ）。
# 未検証: Windows 実機では動かしていない（01_ナレッジ/定期実行の導入手順_Windows.md 参照）。
param([switch]$DryRun)

# ネイティブコマンド（git / claude）が stderr に出しても止まらないよう Continue にし、終了コードは $LASTEXITCODE で見る
$ErrorActionPreference = 'Continue'

# 日本語の入出力（プロンプトを stdin で渡す・ログに書く）を UTF-8 に揃える
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8

$Repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$LogDir = Join-Path $env:LOCALAPPDATA 'munder-scheduled'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Log = Join-Path $LogDir ("digest-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))

function Write-Log([string]$Text) {
  [System.IO.File]::AppendAllText($Log, $Text + "`r`n", $utf8)
}
function Invoke-Logged([scriptblock]$Command) {
  # 標準出力・標準エラーを1行ずつログへ（画面には出さない）
  & $Command 2>&1 | ForEach-Object { Write-Log ([string]$_) }
}
function Get-Now { Get-Date -Format 'yyyy-MM-ddTHH:mm:sszzz' }

# タスクスケジューラの PATH は対話シェルと違うことがあるので、claude / gh / git の置き場を足す
$env:PATH = (@(
    (Join-Path $env:USERPROFILE '.local\bin'),
    (Join-Path $env:APPDATA 'npm'),
    (Join-Path $env:ProgramFiles 'Git\cmd'),
    (Join-Path $env:ProgramFiles 'GitHub CLI')
  ) -join ';') + ';' + $env:PATH

Set-Location $Repo
Write-Log "[$(Get-Now)] digest start repo=$Repo"

# 他の週1要約が走っていたら二重起動しない
$Lock = Join-Path $LogDir 'digest.lock'
try { New-Item -ItemType Directory -Path $Lock -ErrorAction Stop | Out-Null }
catch { Write-Log "locked: $Lock (already running)"; exit 0 }

$Wt = $null
try {
  $Inbox = '01_ナレッジ/_inbox/mistakes.jsonl'
  $InboxPath = Join-Path $Repo $Inbox
  if (-not (Test-Path $InboxPath) -or (Get-Item $InboxPath).Length -eq 0) {
    Write-Log "今週は記録なし（$Inbox が空/無し）。終了"
    exit 0
  }

  Invoke-Logged { git fetch origin main --quiet }

  # Git のパターンと Bash ツールは / 区切りで揃える（Git Bash 経由で動くため）
  $RepoFwd = $Repo -replace '\\', '/'

  if ($DryRun) {
    $RunDir = $Repo
    $PromptFile = Join-Path $Repo '01_ナレッジ\weekly-digest-prompt.md'
    $ModeNote = '【dry-run】ファイルは一切変更しない。git・gh は実行しない。やる内容と、作る/更新するファイル名・型の分類案・needs-human を付けるか否かを日本語で報告するだけにする。'
    $Allowed = @('Read', 'Glob', 'Grep')
  } else {
    # 利用者の作業中クローンは触らない: origin/main から別ディレクトリに作業ツリーを切り、そこで作業する。
    # _inbox/ は元のクローン（$Repo）から読むだけ・archive へ mv するだけ。
    $Branch = 'chore/knowledge-digest-' + (Get-Date -Format 'yyyyMMdd-HHmm')
    $Wt = Join-Path $LogDir ('digest-worktree-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
    Invoke-Logged { git worktree add -q -b $Branch $Wt origin/main }
    if (-not (Test-Path $Wt)) { Write-Log "作業ツリーを作れなかったため終了: $Wt"; exit 1 }
    $RunDir = $Wt
    $WtFwd = $Wt -replace '\\', '/'
    $PromptFile = Join-Path $Wt '01_ナレッジ\weekly-digest-prompt.md'
    $ModeNote = "作業ツリー $WtFwd（ブランチ $Branch は作成済み。ブランチの作成・切り替えはしない）の中で、01_ナレッジ/ と CLAUDE.md を編集する。生ログは $RepoFwd/01_ナレッジ/_inbox/ にあり、読む・処理後に $RepoFwd/01_ナレッジ/_inbox/archive/ へ mv するだけ（作業ツリーの外なので git の対象にならない）。"
    $Allowed = @(
      'Read', 'Glob', 'Grep', 'Write', 'Edit',
      'Bash(git add 01_ナレッジ/*)',
      'Bash(git add CLAUDE.md)',
      'Bash(git commit *)',
      "Bash(git push -u origin $Branch)",
      'Bash(git status*)', 'Bash(git diff*)', 'Bash(git log*)',
      'Bash(gh pr create *)',
      'Bash(gh pr edit *--add-label needs-human*)',
      "Bash(mv $RepoFwd/01_ナレッジ/_inbox/*)",
      "Bash(mkdir -p $RepoFwd/01_ナレッジ/_inbox/archive)",
      'Bash(mkdir -p 01_ナレッジ/*)'
    )
  }

  $Prompt = (Get-Content -Raw -Encoding UTF8 $PromptFile) + @"


---
追加条件（無人実行のため厳守）:
- $ModeNote
- 生ログ（$RepoFwd/$Inbox）は読むだけ・アーカイブへ mv するだけ。git add / commit / push の対象にしない。プロンプト本文中の「作業ブランチを切る」手順は、スクリプトが作成済みなので行わない。
- git add は 01_ナレッジ/ 配下の指定ファイルと CLAUDE.md だけ。``git add -A`` / ``git add .`` は禁止（許可もされない）。
- main へ直接 push しない。
- CLAUDE.md の auto:mistakes ブロックを書き換えた場合は、PR 作成後に ``gh pr edit <PR> --add-label needs-human`` を付け、PR 本文にも「CLAUDE.md を変更したため人のレビュー必要（00_ルール/PRレビュー規定.md §3-4）」と書く。
- ログ・PR 本文・ファイルに秘匿情報（キー・パスワード・トークン）を書かない。
"@

  Set-Location $RunDir
  # プロンプトは引数ではなく stdin で渡す（複数行・引用符・日本語を Windows のコマンドライン引数に載せると壊れやすいため）
  Invoke-Logged {
    $Prompt | claude -p `
      --allowedTools $Allowed `
      --max-turns 40 `
      --add-dir $Repo `
      --output-format text
  }
  Write-Log "[$(Get-Now)] digest end"
}
finally {
  Set-Location $Repo
  if ($Wt) { Invoke-Logged { git worktree remove --force $Wt } }
  Remove-Item -Force -Recurse -ErrorAction SilentlyContinue $Lock
}
