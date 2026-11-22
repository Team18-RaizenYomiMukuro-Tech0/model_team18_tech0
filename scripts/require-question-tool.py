#!/usr/bin/env python3
"""Claude Code Stop hook: りじちょーが、利用者への頼みを返事の文章だけで書いてターンを終えるのを 1 回だけ差し戻す。

- 起きたこと: 判断や操作（コマンドを流す・承認を打つ）の頼みを文章に書くだけで、質問の道具を出さずに止まった
  （2026-11-23 に 6 回。`01_ナレッジ/mistakes/question-in-text-not-asked.md`）。記録を書いた後もくり返した。
- 効く範囲: 作業フォルダ（cwd）が `.command-center/worktrees/` の下に無いセッションだけ（りじちょー）。
  担当の作業フォルダには効かない（担当は SendMessage で報告する。`require-report-before-stop.py`）。
- 判定: 最後の入力より後に AskUserQuestion（または command-center の ask_user）の呼び出しが無く、
  最後の返事の終わり（コードの書式を除いた最後の 2 文）に、頼みの言い方があれば差し戻す。
- くり返し防止: 差し戻した直後の終了（`stop_hook_active` が true）は通す。
- 判定できないときは止めない（何も出さずに終わる）。
"""
import json
import re
import sys

WORKTREE_MARK = "/.command-center/worktrees/"
NOTIFICATION = "<task-notification>"
ASK_TOOLS = {"AskUserQuestion", "mcp__command-center__ask_user"}
REQUEST = re.compile(r"(てください|て下さい|教えて|決めて|選んで|お願いします|ませんか|ますか[？?]|でしょうか)")

REASON = (
    "返事の最後が、利用者への頼み（判断・操作・返事）になっていますが、質問の道具を出していません。"
    "決めてほしいことと、利用者に動いてもらうこと（コマンドを流す・承認を打つ）は、AskUserQuestion で出してください。"
    "文章は背景の説明だけにします（01_ナレッジ/mistakes/question-in-text-not-asked.md）。"
    "頼みでなく、次に起きることを書いただけなら、そのまま終えてかまいません。"
)


def is_input(entry: dict) -> bool:
    if entry.get("type") != "user":
        return False
    content = (entry.get("message") or {}).get("content")
    if isinstance(content, str):
        return not content.lstrip().startswith(NOTIFICATION)
    if isinstance(content, list):
        kinds = {b.get("type") for b in content if isinstance(b, dict)}
        if "tool_result" in kinds:
            return False
        text = "".join(b.get("text", "") for b in content if isinstance(b, dict))
        return bool(text) and not text.lstrip().startswith(NOTIFICATION)
    return False


def blocks(entry: dict) -> list:
    if entry.get("type") != "assistant":
        return []
    content = (entry.get("message") or {}).get("content")
    return [b for b in content if isinstance(b, dict)] if isinstance(content, list) else []


def tail_sentences(text: str, n: int = 2) -> str:
    text = re.sub(r"```[\s\S]*?```", "", text)
    text = re.sub(r"`[^`]*`", "", text)
    parts = [p for p in re.split(r"(?<=[。！？?!])|\n", text) if p.strip()]
    return "".join(parts[-n:])


def needs_question(lines: list) -> bool:
    entries = []
    for line in lines:
        try:
            entries.append(json.loads(line))
        except ValueError:
            continue
    last_input = max((i for i, e in enumerate(entries) if is_input(e)), default=-1)
    if last_input < 0:
        return False
    after = entries[last_input + 1 :]
    if any(b.get("type") == "tool_use" and b.get("name") in ASK_TOOLS for e in after for b in blocks(e)):
        return False
    last_text = ""
    for e in after:
        for b in blocks(e):
            if b.get("type") == "text" and b.get("text", "").strip():
                last_text = b["text"]
    return bool(last_text) and bool(REQUEST.search(tail_sentences(last_text)))


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except ValueError:
        return
    if data.get("stop_hook_active"):
        return
    cwd = str(data.get("cwd") or "").replace("\\", "/")
    if WORKTREE_MARK in cwd + "/":
        return
    try:
        with open(str(data.get("transcript_path") or ""), encoding="utf-8") as f:
            lines = f.readlines()
    except OSError:
        return
    if needs_question(lines):
        print(json.dumps({"decision": "block", "reason": REASON}, ensure_ascii=False))


if __name__ == "__main__":
    main()
