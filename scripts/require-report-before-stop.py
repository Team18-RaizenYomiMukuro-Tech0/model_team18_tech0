#!/usr/bin/env python3
"""Claude Code Stop hook: 担当（AI スタッフ）が、りじちょーへ報告を送らずにターンを終えるのを 1 回だけ差し戻す。

- 起きたこと: 担当が裏の処理を待つ間や「了解」の返事で、画面に書いただけで止まり、アプリに催促された
  （2026-11-20 に 3 回。`01_ナレッジ/mistakes/stopped-without-report.md`）。決まりを定義に書くだけでは防げなかった。
- 効く範囲: 作業フォルダ（cwd）が `.command-center/worktrees/` の下にあるセッションだけ（担当の作業フォルダ）。
  りじちょーと人の作業フォルダには効かない。
- 判定: 最後の「入力」（依頼・人の指示・ほかのセッションからの連絡・アプリの催促）より後に、
  SendMessage の呼び出しが 1 つも無ければ、止まるのを差し戻す（`{"decision": "block", "reason": ...}`）。
  裏の処理の終わりの知らせ（<task-notification>）は入力に数えない（待ちの途中で起こされただけのため）。
- くり返し防止: 差し戻した直後の終了（`stop_hook_active` が true）は通す。
- 判定できないとき（入力が壊れている、会話の記録が読めない）は止めない（何も出さずに終わる）。作業を止めないため。
"""
import json
import sys

WORKTREE_MARK = "/.command-center/worktrees/"
NOTIFICATION = "<task-notification>"
REASON = (
    "止まる前に、りじちょー（model-team18-tech0-rijicho）へ SendMessage で 1 通送ってください。"
    "終わったなら「完了」（PR の URL と要点）、待つなら「待ち」（何を待つか・終わる見込み）、"
    "進めないなら「詰まり」（誰が何をすれば進むか）。「了解」の返事も 1 行で送ります。"
    "画面に書いただけの文は届きません（.claude/agents/<担当>.md の「報告（止まる前に必ず送る）」）。"
)


def is_input(entry: dict) -> bool:
    """会話の 1 行が、ターンを始めた入力か。道具の結果と、裏の処理の知らせは入力ではない。"""
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


def sent_report(entry: dict) -> bool:
    """会話の 1 行に、SendMessage の呼び出しがあるか。"""
    if entry.get("type") != "assistant":
        return False
    content = (entry.get("message") or {}).get("content")
    return isinstance(content, list) and any(
        isinstance(b, dict) and b.get("type") == "tool_use" and b.get("name") == "SendMessage" for b in content
    )


def needs_report(lines: list[str]) -> bool:
    """最後の入力より後に SendMessage が無ければ True。"""
    entries = []
    for line in lines:
        try:
            entries.append(json.loads(line))
        except ValueError:
            continue
    last_input = max((i for i, e in enumerate(entries) if is_input(e)), default=-1)
    if last_input < 0:
        return False
    return not any(sent_report(e) for e in entries[last_input + 1 :])


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except ValueError:
        return
    if data.get("stop_hook_active"):
        return
    cwd = str(data.get("cwd") or "").replace("\\", "/")
    if WORKTREE_MARK not in cwd + "/":
        return
    try:
        with open(str(data.get("transcript_path") or ""), encoding="utf-8") as f:
            lines = f.readlines()
    except OSError:
        return
    if needs_report(lines):
        print(json.dumps({"decision": "block", "reason": REASON}, ensure_ascii=False))


if __name__ == "__main__":
    main()
