#!/usr/bin/env python3
"""週1要約（機械版・フォールバック）：_inbox/mistakes.jsonl を読み、ミスの型に束ねて記録＋予防に反映する。

主系統は AI 版（01_ナレッジ/weekly-digest-prompt.md を /schedule に登録）。本スクリプトは
AI を使わないときの代替。コマンド＋エラー先頭行で機械的に束ねるため、型が割れやすい点に注意。


やること:
  1. _inbox/mistakes.jsonl を読む
  2. 「正規化コマンド＋エラー先頭行」で型にクラスタリング（重複排除・冪等）
  3. 01_ナレッジ/mistakes/<slug>.md を追記/更新（発生回数・最終発生日・サンプル）
  4. index.md / log.md を更新
  5. deploy-checklist.md を再生成（デプロイ系の型から）
  6. CLAUDE.md の自動ブロックを更新（発生2回以上の型）
  7. 処理済みを _inbox/archive/ へ退避し、inbox を空にする

使い方:  python3 scripts/weekly-digest.py
         （定期実行は /schedule ルーティンから呼ぶ。README 参照）
"""
import os, sys, json, re, hashlib, datetime

PROJ = os.environ.get("CLAUDE_PROJECT_DIR") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KB = os.path.join(PROJ, "01_ナレッジ")
INBOX = os.path.join(KB, "_inbox", "mistakes.jsonl")
ARCHIVE = os.path.join(KB, "_inbox", "archive")
MISTAKES = os.path.join(KB, "mistakes")
TODAY = datetime.date.today().isoformat()
PROMOTE_THRESHOLD = 2  # この回数以上で deploy-checklist / CLAUDE.md に昇格

DEPLOY_HINT = re.compile(r"(deploy|vercel|render|netlify|npm run build|next build|docker|supabase db push|migrat)", re.I)


def norm_cmd(cmd):
    cmd = (cmd or "").strip()
    cmd = re.sub(r"\s+", " ", cmd)
    return cmd[:80]


def first_err_line(err):
    for line in (err or "").splitlines():
        line = line.strip()
        if line:
            return line[:120]
    return ""


def signature(rec):
    base = norm_cmd(rec.get("command")) + "|" + first_err_line(rec.get("error"))
    return base.strip("|")


def slug(sig):
    h = hashlib.sha1(sig.encode("utf-8")).hexdigest()[:8]
    head = re.sub(r"[^0-9A-Za-z一-龠ぁ-んァ-ン]+", "-", norm_cmd(sig)).strip("-").lower()[:40] or "mistake"
    return f"{head}-{h}"


def load_inbox():
    recs = []
    if not os.path.exists(INBOX):
        return recs
    with open(INBOX, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                recs.append(json.loads(line))
            except Exception:
                continue
    return recs


def read_existing_count(path):
    """既存記事から現在の発生回数を拾う（冪等に積み増すため）。"""
    if not os.path.exists(path):
        return 0
    try:
        with open(path, encoding="utf-8") as f:
            m = re.search(r"発生回数:\s*(\d+)", f.read())
            return int(m.group(1)) if m else 0
    except Exception:
        return 0


def write_mistake(sig, group):
    os.makedirs(MISTAKES, exist_ok=True)
    sl = slug(sig)
    path = os.path.join(MISTAKES, f"{sl}.md")
    prev = read_existing_count(path)
    total = prev + len(group)
    sample = group[-1]
    is_deploy = bool(DEPLOY_HINT.search((sample.get("command") or "") + " " + (sample.get("error") or "")))
    body = f"""---
title: {norm_cmd(sample.get('command')) or '(コマンド不明)'}
type: knowledge
origin: internal
tags: [mistake{', deploy' if is_deploy else ''}]
created: {TODAY}
updated: {TODAY}
---

# ミスの型: {first_err_line(sample.get('error')) or norm_cmd(sample.get('command'))}

- 発生回数: {total}
- 最終発生日: {sample.get('ts', TODAY)}
- 収集源: {sample.get('source', '-')}
- デプロイ系: {'はい' if is_deploy else 'いいえ'}

## 症状（エラー）
```
{(sample.get('error') or '').strip()[:800]}
```

## 実行コマンド
```
{(sample.get('command') or '').strip()[:300]}
```

## 原因（記入）
<!-- なぜ起きたか。分かったら埋める -->

## 直し方 / 再発防止（記入）
<!-- どうすれば踏まないか。デプロイ前チェックに載せる項目があればここに -->
"""
    with open(path, "w", encoding="utf-8") as f:
        f.write(body)
    return sl, total, is_deploy, sample


def rebuild_index(entries):
    lines = ["# ナレッジ目録（index）", "", "記事を探すときはここから。週1要約が自動更新する。", "", "## ミスの型（自動収集）", ""]
    if not entries:
        lines.append("（まだ記事はありません）")
    else:
        for sl, total, is_deploy, sample in sorted(entries, key=lambda e: -e[1]):
            tag = "（deploy）" if is_deploy else ""
            lines.append(f"- [{first_err_line(sample.get('error')) or sl}](mistakes/{sl}.md) — {total}回{tag}")
    with open(os.path.join(KB, "index.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


def append_log(n_new, n_types):
    line = f"\n## [{TODAY}] 還元 | 週1要約（新規{n_new}件 → 型{n_types}件に整理）\n"
    with open(os.path.join(KB, "log.md"), "a", encoding="utf-8") as f:
        f.write(line)


def rebuild_checklist(entries):
    deploy = [(sl, total, s) for sl, total, is_d, s in entries if is_d]
    lines = ["# デプロイ前チェックリスト（自動更新）", "",
             f"最終更新: {TODAY}。過去のデプロイ系ミスから自動生成。デプロイ着手前に確認する。", ""]
    if not deploy:
        lines.append("（まだデプロイ系のミスは記録されていません）")
    else:
        for sl, total, s in sorted(deploy, key=lambda e: -e[1]):
            lines.append(f"- [ ] {first_err_line(s.get('error')) or norm_cmd(s.get('command'))} "
                         f"（{total}回 / 詳細: `01_ナレッジ/mistakes/{sl}.md`）")
    with open(os.path.join(KB, "deploy-checklist.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


def update_claude_block(entries):
    claude = os.path.join(PROJ, "CLAUDE.md")
    if not os.path.exists(claude):
        return
    promoted = [e for e in entries if e[1] >= PROMOTE_THRESHOLD]
    inner = [f"最終更新: {TODAY}。発生{PROMOTE_THRESHOLD}回以上の型。作業前に目を通す。", ""]
    if not promoted:
        inner.append("（まだ繰り返しているミスはありません）")
    else:
        for sl, total, is_d, s in sorted(promoted, key=lambda e: -e[1]):
            tag = "【デプロイ】" if is_d else ""
            inner.append(f"- {tag}{first_err_line(s.get('error')) or norm_cmd(s.get('command'))}（{total}回, `01_ナレッジ/mistakes/{sl}.md`）")
    block = "<!-- auto:mistakes start -->\n## よくあるミス（自動更新・手書き禁止）\n\n" + "\n".join(inner) + "\n<!-- auto:mistakes end -->"
    with open(claude, encoding="utf-8") as f:
        txt = f.read()
    if "<!-- auto:mistakes start -->" in txt:
        txt = re.sub(r"<!-- auto:mistakes start -->.*?<!-- auto:mistakes end -->", block, txt, flags=re.S)
    else:
        txt = txt.rstrip() + "\n\n" + block + "\n"
    with open(claude, "w", encoding="utf-8") as f:
        f.write(txt)


def archive_inbox(recs):
    if not os.path.exists(INBOX):
        return
    os.makedirs(ARCHIVE, exist_ok=True)
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    dst = os.path.join(ARCHIVE, f"mistakes-{stamp}.jsonl")
    os.rename(INBOX, dst)


def main():
    recs = load_inbox()
    if not recs:
        print("inbox は空。更新なし。")
        return
    groups = {}
    for r in recs:
        groups.setdefault(signature(r), []).append(r)
    entries = []
    for sig, group in groups.items():
        entries.append(write_mistake(sig, group))
    rebuild_index(entries)
    rebuild_checklist(entries)
    update_claude_block(entries)
    append_log(len(recs), len(groups))
    archive_inbox(recs)
    print(f"要約完了: 新規{len(recs)}件 → 型{len(groups)}件。index/checklist/CLAUDE.md 更新、inbox をアーカイブ。")


if __name__ == "__main__":
    main()
