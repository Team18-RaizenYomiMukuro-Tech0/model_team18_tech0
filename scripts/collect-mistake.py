#!/usr/bin/env python3
"""Claude Code PostToolUseFailure hook: Bash の失敗を 01_ナレッジ/_inbox/mistakes.jsonl に記録する。

- 失敗したツール呼び出しは PostToolUse ではなく PostToolUseFailure で届く。
- 出力の文字列では判定しない（成功したコマンドの出力に「No such file」等が含まれると誤検知するため）。

- 秘匿情報（APIキー・トークン・DB資格情報・ユーザー名パス）はマスクしてから書く。
- 何があっても作業を止めない（常に exit 0。例外は握りつぶす）。
- 標準入力に Claude Code のフック JSON を受け取る。
"""
import sys, os, json, re, datetime


def mask(text):
    """秘匿情報をマスクする。"""
    if not text:
        return text
    s = str(text)
    home = os.path.expanduser("~")
    if home and home != "~":
        s = s.replace(home, "~")
    s = re.sub(r"/Users/[^/\s]+", "/Users/<user>", s)
    s = re.sub(r"/home/[^/\s]+", "/home/<user>", s)
    # Windows のユーザーフォルダ: C:\Users\名前 / C:/Users/名前 / Git Bash の /c/Users/名前 / WSL の /mnt/c/Users/名前
    # 名前に空白があっても、次の区切り（\ か /）まで伏せる。区切りが無ければ空白までを伏せる
    s = re.sub(r"(?i)\b([A-Z]):[\\/]+Users[\\/]+(?:[^\\/:\"'<>|*?\r\n]+(?=[\\/])|[^\\/\s\"']+)", r"\1:/Users/<user>", s)
    s = re.sub(r"(?i)(?<![\w.\-/])((?:/mnt)?/[a-z])/Users/(?:[^/:\"'<>|*?\r\n]+(?=/)|[^/\s\"']+)", r"\1/Users/<user>", s)
    # KEY=VALUE / KEY: VALUE 形式の秘匿値
    s = re.sub(
        r"(?i)\b([A-Z0-9_]*(?:PASSWORD|SECRET|TOKEN|API[_-]?KEY|PASSWD|PASS|PRIVATE[_-]?KEY)[A-Z0-9_]*)\s*[=:]\s*([^\s'\"]+)",
        r"\1=<masked>", s)
    # トークン様文字列
    s = re.sub(
        r"\b(sk-[A-Za-z0-9]{8,}|ghp_[A-Za-z0-9]{8,}|github_pat_[A-Za-z0-9_]{8,}|xox[baprs]-[A-Za-z0-9-]+|eyJ[A-Za-z0-9_\-\.]{10,})\b",
        "<masked-token>", s)
    # URL 内の資格情報 scheme://user:pass@host
    s = re.sub(r"(\w+://[^:\s/]+):([^@\s]+)@", r"\1:<masked>@", s)
    return s


def main():
    try:
        raw = sys.stdin.read()
        data = json.loads(raw) if raw.strip() else {}
    except Exception:
        return

    tool = data.get("tool_name") or data.get("toolName") or ""
    if tool and tool != "Bash":
        return

    ti = data.get("tool_input") or data.get("toolInput") or {}
    tr = data.get("tool_response") or data.get("toolResponse") or {}
    command = ti.get("command") if isinstance(ti, dict) else str(ti)

    event = data.get("hook_event_name") or ""
    exit_code = None
    err_text = ""
    if isinstance(tr, dict):
        for k in ("exit_code", "exitCode", "returncode", "code"):
            if isinstance(tr.get(k), int):
                exit_code = tr[k]
        err_text = tr.get("stderr") or tr.get("error") or tr.get("stdout") or tr.get("output") or ""
    elif tr:
        err_text = str(tr)
    if event == "PostToolUseFailure":
        failed = True
        err_text = data.get("error") or err_text
    else:
        failed = exit_code is not None and exit_code != 0
    if not failed or data.get("is_interrupt"):
        return
    if isinstance(err_text, (dict, list)):
        err_text = json.dumps(err_text, ensure_ascii=False)

    proj = os.environ.get("CLAUDE_PROJECT_DIR") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    rec = {
        "ts": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "claude-bash",
        "command": (mask(command) or "")[:500],
        "exit_code": exit_code,
        "error": (mask(err_text) or "")[:1500],
        "cwd": mask(os.getcwd()),
    }
    inbox = os.path.join(proj, "01_ナレッジ", "_inbox")
    os.makedirs(inbox, exist_ok=True)
    with open(os.path.join(inbox, "mistakes.jsonl"), "a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
    sys.exit(0)
