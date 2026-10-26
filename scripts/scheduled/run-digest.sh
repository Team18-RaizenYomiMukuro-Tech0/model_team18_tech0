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
cd "${REPO}"
echo "[$(date -Iseconds)] digest start repo=${REPO}"

DRY=""
[ "${1:-}" = "--dry-run" ] && DRY=1

# 他の週1要約が走っていたら二重起動しない
LOCK="$LOG_DIR/digest.lock"
if ! mkdir "$LOCK" 2>/dev/null; then echo "locked: $LOCK (already running)"; exit 0; fi
WT=""; BRANCH=""
cleanup() {
  [ -n "${WT}" ] && git -C "${REPO}" worktree remove --force "${WT}" 2>/dev/null || true
  rmdir "$LOCK" 2>/dev/null || true
}
trap cleanup EXIT

INBOX="01_ナレッジ/_inbox/mistakes.jsonl"
if [ ! -s "${INBOX}" ]; then echo "今週は記録なし（${INBOX} が空/無し）。終了"; exit 0; fi

git fetch origin main --quiet

if [ -n "$DRY" ]; then
  RUN_DIR="${REPO}"
  PROMPT_FILE="${REPO}/01_ナレッジ/weekly-digest-prompt.md"
  MODE_NOTE="【dry-run】ファイルは一切変更しない。git・gh は実行しない。やる内容と、作る/更新するファイル名・型の分類案・needs-human を付けるか否かを日本語で報告するだけにする。"
  ALLOWED=(Read Glob Grep)
else
  # 利用者の作業中クローンは触らない: origin/main から別ディレクトリに作業ツリーを切り、そこで作業する。
  # _inbox/ は元のクローン（${REPO}）から読むだけ・archive へ mv するだけ。
  BRANCH="chore/knowledge-digest-$(date +%Y%m%d-%H%M)"
  WT="$LOG_DIR/digest-worktree-$(date +%Y%m%d-%H%M%S)"
  git worktree add -q -b "${BRANCH}" "${WT}" origin/main
  RUN_DIR="${WT}"
  PROMPT_FILE="${WT}/01_ナレッジ/weekly-digest-prompt.md"
  MODE_NOTE="作業ツリー ${WT}（ブランチ ${BRANCH} は作成済み。ブランチの作成・切り替えはしない）の中で、01_ナレッジ/ と CLAUDE.md を編集する。生ログは ${REPO}/01_ナレッジ/_inbox/ にあり、読む・処理後に ${REPO}/01_ナレッジ/_inbox/archive/ へ mv するだけ（作業ツリーの外なので git の対象にならない）。"
  ALLOWED=(
    Read Glob Grep Write Edit
    "Bash(git add 01_ナレッジ/*)"
    "Bash(git add CLAUDE.md)"
    "Bash(git commit *)"
    "Bash(git push -u origin ${BRANCH})"
    "Bash(git status*)" "Bash(git diff*)" "Bash(git log*)"
    "Bash(gh pr create *)"
    "Bash(gh pr edit *--add-label needs-human*)"
    "Bash(mv ${REPO}/01_ナレッジ/_inbox/*)"
    "Bash(mkdir -p ${REPO}/01_ナレッジ/_inbox/archive)"
    "Bash(mkdir -p 01_ナレッジ/*)"
  )
fi

PROMPT="$(cat "$PROMPT_FILE")

---
追加条件（無人実行のため厳守）:
- $MODE_NOTE
- 生ログ（${REPO}/${INBOX}）は読むだけ・アーカイブへ mv するだけ。git add / commit / push の対象にしない。プロンプト本文中の「作業ブランチを切る」手順は、スクリプトが作成済みなので行わない。
- git add は 01_ナレッジ/ 配下の指定ファイルと CLAUDE.md だけ。\`git add -A\` / \`git add .\` は禁止（許可もされない）。
- main へ直接 push しない。
- CLAUDE.md の auto:mistakes ブロックを書き換えた場合は、PR 作成後に \`gh pr edit <PR> --add-label needs-human\` を付け、PR 本文にも「CLAUDE.md を変更したため人のレビュー必要（00_ルール/PRレビュー規定.md §3-4）」と書く。
- ログ・PR 本文・ファイルに秘匿情報（キー・パスワード・トークン）を書かない。"

cd "$RUN_DIR"
claude -p "$PROMPT" \
  --allowedTools "${ALLOWED[@]}" \
  --max-turns 40 \
  --add-dir "${REPO}" \
  --output-format text

echo "[$(date -Iseconds)] digest end"
