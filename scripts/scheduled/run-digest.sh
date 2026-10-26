#!/bin/bash
# 週1要約（無人実行）。launchd から呼ぶ。手動の動作確認は --dry-run。
#   scripts/scheduled/run-digest.sh [--dry-run]
# 許可ツールは下の ALLOWED に限る。--dangerously-skip-permissions は使わない。
# 生ログ 01_ナレッジ/_inbox/ はコミット・push しない（.gitignore 済み。git add は 01_ナレッジ/ 配下の指定ファイルのみ）。
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
LOG_DIR="${HOME}/Library/Logs/munder-scheduled"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/digest-$(date +%Y%m%d-%H%M%S).log"
exec >>"$LOG" 2>&1

# launchd の PATH は最小限なので、claude / gh / git の置き場を足す
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
cd "$REPO"
echo "[$(date -Iseconds)] digest start repo=$REPO"

DRY=""
[ "${1:-}" = "--dry-run" ] && DRY=1

# 他の週1要約が走っていたら二重起動しない
LOCK="$LOG_DIR/digest.lock"
if ! mkdir "$LOCK" 2>/dev/null; then echo "locked: $LOCK (already running)"; exit 0; fi
trap 'rmdir "$LOCK"' EXIT

INBOX="01_ナレッジ/_inbox/mistakes.jsonl"
if [ ! -s "$INBOX" ]; then echo "今週は記録なし（$INBOX が空/無し）。終了"; exit 0; fi

git fetch origin main --quiet

if [ -n "$DRY" ]; then
  MODE_NOTE="【dry-run】ファイルは一切変更しない。git・gh は実行しない。やる内容と、作る/更新するファイル名・型の分類案・needs-human を付けるか否かを日本語で報告するだけにする。"
  ALLOWED=(Read Glob Grep)
else
  MODE_NOTE="作業は origin/main から切った新しいブランチ chore/knowledge-digest-<今日の日付 YYYYMMDD。$(date) などのシェル展開は使わず実際の数字で書く> で行う（`git switch -c <ブランチ> origin/main` で切る）。"
  ALLOWED=(
    Read Glob Grep Write Edit
    "Bash(git switch -c chore/knowledge-digest-*)"
    "Bash(git add 01_ナレッジ/*)"
    "Bash(git add CLAUDE.md)"
    "Bash(git commit *)"
    "Bash(git push -u origin chore/knowledge-digest-*)"
    "Bash(git status*)" "Bash(git diff*)" "Bash(git log*)"
    "Bash(gh pr create *)"
    "Bash(gh pr edit *--add-label needs-human*)"
    "Bash(mv 01_ナレッジ/_inbox/*)"
    "Bash(mkdir -p 01_ナレッジ/*)"
  )
fi

PROMPT="$(cat 01_ナレッジ/weekly-digest-prompt.md)

---
追加条件（無人実行のため厳守）:
- $MODE_NOTE
- 01_ナレッジ/_inbox/ 配下は読むだけ・アーカイブへ mv するだけ。git add / commit / push の対象にしない。
- git add は 01_ナレッジ/ 配下の指定ファイルと CLAUDE.md だけ。\`git add -A\` / \`git add .\` は禁止（許可もされない）。
- main へ直接 push しない。
- CLAUDE.md の auto:mistakes ブロックを書き換えた場合は、PR 作成後に \`gh pr edit <PR> --add-label needs-human\` を付け、PR 本文にも「CLAUDE.md を変更したため人のレビュー必要（00_ルール/PRレビュー規定.md §3-4）」と書く。
- ログ・PR 本文・ファイルに秘匿情報（キー・パスワード・トークン）を書かない。"

claude -p "$PROMPT" \
  --allowedTools "${ALLOWED[@]}" \
  --max-turns 40 \
  --output-format text

echo "[$(date -Iseconds)] digest end"
