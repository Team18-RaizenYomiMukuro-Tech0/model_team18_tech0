#!/usr/bin/env python3
"""Claude Code PreToolUse hook（Bash）: 未コミットのファイルが残る作業フォルダを `git worktree remove --force` で消させない（#219）。

- 標準入力に Claude Code のフック JSON（tool_input.command・cwd）を受け取る。
- コマンドの中に `git ... worktree remove` があり、`--force` か `-f` が付いていて、
  消す先のフォルダに `git status --porcelain` で出るファイル（未コミットの変更・未追跡のファイル）があれば、
  exit 2 で止め、ファイル名を標準エラーに出す（Claude Code はこれを Claude に返す）。
- `.gitignore` で無視されるファイル（.env のコピー・node_modules など）は対象外（消えてよいもの）。
- 判定できないとき（入力が壊れている、フォルダが無い、git が動かない）は止めない（exit 0）。作業を止めないため。
"""
import json
import os
import re
import shlex
import subprocess
import sys

SEP = re.compile(r"&&|\|\||;|\||\n")
MSYS = re.compile(r"^/([a-zA-Z])(/|$)")


def native(path: str) -> str:
    """Windows の Git Bash の形（/c/Users/...）を C:/Users/... に直す。ほかの OS ではそのまま。"""
    return MSYS.sub(lambda m: m.group(1).upper() + ":/", path) if os.name == "nt" else path


def targets(command: str, cwd: str) -> list[str]:
    """`git [-C dir] worktree remove (--force|-f) ... <path>` の <path> を絶対パスで返す。"""
    out = []
    for part in SEP.split(command):
        try:
            tok = shlex.split(part.replace("\\", "/"), posix=True)  # Windows の \ を / に（shlex が \ を消すため）
        except ValueError:
            continue
        if "git" not in tok:
            continue
        tok = tok[tok.index("git") + 1 :]
        base = cwd
        while len(tok) >= 2 and tok[0] == "-C":
            base = os.path.join(base, native(tok[1]))
            tok = tok[2:]
        if tok[:2] != ["worktree", "remove"]:
            continue
        args = tok[2:]
        if not any(a in ("--force", "-f", "-ff") for a in args):
            continue
        paths = [a for a in args if not a.startswith("-")]
        if paths:
            out.append(os.path.normpath(os.path.join(native(base), native(paths[-1]))))
    return out


def dirty_files(path: str) -> list[str]:
    if not os.path.isdir(path):
        return []
    r = subprocess.run(["git", "-C", path, "status", "--porcelain"], capture_output=True, text=True, encoding="utf-8", timeout=20)
    if r.returncode != 0:
        return []
    return [line[3:] for line in r.stdout.splitlines() if line.strip()]


def main() -> int:
    try:
        data = json.load(sys.stdin)
        command = (data.get("tool_input") or {}).get("command") or ""
        cwd = data.get("cwd") or os.getcwd()
        for path in targets(command, cwd):
            files = dirty_files(path)
            if files:
                shown = "\n".join(f"  - {f}" for f in files[:20])
                more = f"\n  （ほか {len(files) - 20} 件）" if len(files) > 20 else ""
                msg = (
                    "止めました（#219）: 消そうとした作業フォルダに、コミットしていないファイルがあります。\n"
                    f"{shown}{more}\n"
                    "残すものはコミット（DB の記録 evidence/db/ は別の PR）してから、--force なしで消してください。"
                    "不要なものだと確かめたなら、そのファイルを消してから --force なしで消してください。\n"
                )
                sys.stderr.buffer.write(msg.encode("utf-8"))  # Windows でも UTF-8 で返す
                sys.stderr.flush()
                return 2
    except Exception:  # noqa: BLE001  判定できないときは止めない
        return 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
