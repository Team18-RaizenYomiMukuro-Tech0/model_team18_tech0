#!/bin/sh
# SessionStart フック（#557）: 一時ファイルの置き場 .work/tmp を毎回作る。失敗しても作業は止めない。
d="${CLAUDE_PROJECT_DIR:-$PWD}/.work/tmp"
mkdir -p "$d" 2>/dev/null
exit 0
