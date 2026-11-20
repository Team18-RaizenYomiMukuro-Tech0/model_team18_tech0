#!/usr/bin/env python3
"""Claude Code PreToolUse hook（Bash）: 無い一時フォルダ・一時ファイルを使うコマンドを実行の前に止める（#557）。

- 標準入力のフック JSON の tool_input.command から、/tmp/・/private/tmp/・$TMPDIR の下のパスを拾う。
- 拾ったパスが存在しなければ exit 2 で止め、「.work/tmp を使ってください」を標準エラーに出す。
- 存在するパスは通す。mkdir・mktemp を含むコマンド、`>` `>>` `tee` の書き込み先は通す（これから作るため）。
- 判定できないとき（入力が壊れている、$TMPDIR が未設定、ほかの変数を含む）は通す（exit 0）。
"""
import json
import os
import re
import shlex
import sys

PREFIXES = ("/tmp/", "/private/tmp/")
VAR = re.compile(r"^\$\{?TMPDIR\}?(/.*)$")


def candidates(command: str) -> list[str]:
    try:
        tok = shlex.split(command.replace("\n", " ; "), posix=True)
    except ValueError:
        return []
    out = []
    for i, t in enumerate(tok):
        prev = tok[i - 1] if i else ""
        if prev in (">", ">>", "tee", "-o", "-O"):
            continue
        t = t.lstrip(">")
        m = VAR.match(t)
        if m:
            base = os.environ.get("TMPDIR", "").rstrip("/")
            if not base:
                continue
            t = base + m.group(1)
        if t.startswith(PREFIXES) and "$" not in t and "*" not in t:
            out.append(t)
    return out


def main() -> int:
    try:
        data = json.load(sys.stdin)
        command = data["tool_input"]["command"]
        if not isinstance(command, str) or re.search(r"\b(mkdir|mktemp)\b", command):
            return 0
        missing = [p for p in candidates(command) if not os.path.exists(p)]
    except Exception:
        return 0
    if missing:
        sys.stderr.write(
            "存在しない一時パスを使っています: " + ", ".join(missing) + "\n"
            ".work/tmp を使ってください（プロジェクト直下。SessionStart で毎回作られます）。\n"
        )
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
