#!/usr/bin/env python3
"""マージ済み PR ごとに、費用（tokens・CI 回数）と手戻りを 1 行ずつ CSV に追記する（#559）。

使い方: python3 scripts/pr-cost.py --since 2026-11-14 --until 2026-11-21
- gh で期間内にマージした PR を集める。
- issue はブランチ名かタイトルの Issue 番号（取れなければ '?'）。
- issue_tokens は Issue 単位の合計（reports.jsonl と ~/.claude/projects の usage）。
  合計しても重ならないよう、その Issue が CSV に最初に出る行だけに書き、2 行目以降は空欄。
  結びつかない時は '?'（推測しない）。会話の text は読まない・出さない。
- 同じ pr の行が既に CSV にあれば足さない。
- .command-center/ と ~/.claude/ は読むだけ。
"""
import argparse
import csv
import glob
import json
import os
import re
import subprocess
import sys
from pathlib import Path

COLUMNS = ["pr", "title", "merged_at", "branch", "issue", "issue_tokens", "ci_runs",
           "review_comments", "fix_commits", "later_fixes"]
ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CSV = ROOT / "01_ナレッジ" / "metrics" / "pr-cost.csv"


def default_reports():
    """リポジトリ直下の記録。worktree（.command-center/worktrees/<名前>）で回す時は本体側を見る。"""
    here = ROOT / ".command-center" / "records" / "reports.jsonl"
    if here.exists():
        return here
    if ROOT.parent.name == "worktrees" and ROOT.parent.parent.name == ".command-center":
        return ROOT.parent.parent / "records" / "reports.jsonl"
    return here


DEFAULT_REPORTS = default_reports()
PROJECTS = Path.home() / ".claude" / "projects"
PROJECT_PREFIX = "-Users-hiroki-asada-GitHub-model-team18-tech0"


def gh_json(args):
    out = subprocess.run(["gh", *args], check=True, capture_output=True, text=True).stdout
    return json.loads(out) if out.strip() else []


def gh_count_lines(args):
    out = subprocess.run(["gh", *args], check=True, capture_output=True, text=True).stdout
    return len([x for x in out.splitlines() if x.strip()])


class Gh:
    """gh の呼び出しをまとめる。テストでは差し替える。"""

    def merged_prs(self, since, until):
        return gh_json(["pr", "list", "--state", "merged", "--limit", "1000",
                        "--search", f"merged:{since}..{until}",
                        "--json", "number,title,mergedAt,headRefName"])

    def all_prs(self):
        return gh_json(["pr", "list", "--state", "all", "--limit", "1000",
                        "--json", "number,body,createdAt"])

    def detail(self, number):
        return gh_json(["pr", "view", str(number), "--json", "reviews,commits,comments"])

    def line_comment_count(self, number):
        return gh_count_lines(["api", "--paginate",
                               f"repos/{{owner}}/{{repo}}/pulls/{number}/comments",
                               "--jq", ".[].id"])

    def run_attempts(self, branch):
        runs = gh_json(["run", "list", "--branch", branch, "--limit", "200",
                        "--json", "attempt"])
        return sum(int(r.get("attempt") or 1) for r in runs)


def issue_of(pr):
    """ブランチ名（例 chore/557-x）→ タイトル（[#557]）の順で Issue 番号を探す。"""
    m = re.search(r"/(\d+)-", pr["headRefName"]) or re.search(r"#(\d+)", pr["title"])
    return int(m.group(1)) if m else None


def load_roles(reports_path):
    """reports.jsonl から {issue: {role,...}} を作る。text は読まない。"""
    roles = {}
    p = Path(reports_path)
    if not p.exists():
        return roles
    for line in p.read_text(encoding="utf-8").splitlines():
        try:
            d = json.loads(line)
        except ValueError:
            continue
        sess, issue = d.get("session"), d.get("issue")
        if sess and issue is not None:
            role = sess.rsplit("-", 1)[-1]
            roles.setdefault(int(issue), set()).add(role)
    return roles


def sum_usage(files):
    """jsonl の usage（input・output・cache の合計）。message id と requestId で重複を除く。"""
    seen, total = set(), 0
    for f in files:
        with open(f, encoding="utf-8") as fh:
            for line in fh:
                try:
                    d = json.loads(line)
                except ValueError:
                    continue
                m = d.get("message")
                u = m.get("usage") if isinstance(m, dict) else None
                if not u:
                    continue
                key = (m.get("id"), d.get("requestId"))
                if key[0] and key in seen:
                    continue
                seen.add(key)
                total += sum(int(u.get(k) or 0) for k in (
                    "input_tokens", "output_tokens",
                    "cache_creation_input_tokens", "cache_read_input_tokens"))
    return total


def find_session_files(issue, roles, projects=PROJECTS):
    files = []
    for role in sorted(roles):
        for d in glob.glob(str(Path(projects) / f"{PROJECT_PREFIX}*worktrees-{issue}-{role}")):
            files += glob.glob(os.path.join(d, "*.jsonl"))
    return files


def tokens_for(pr, roles_by_issue, projects=PROJECTS, usage=sum_usage):
    issue = issue_of(pr)
    if issue is None or issue not in roles_by_issue:
        return "?"
    files = find_session_files(issue, roles_by_issue[issue], projects)
    return usage(files) if files else "?"


def later_fixes(number, merged_at, all_prs):
    pat = re.compile(rf"#{number}(?!\d)")
    return sum(1 for p in all_prs
               if p["number"] != number and p["createdAt"] > merged_at
               and pat.search(p.get("body") or ""))


def build_row(pr, gh, all_prs, roles_by_issue, projects=PROJECTS, usage=sum_usage):
    n = pr["number"]
    detail = gh.detail(n)
    reviews = detail.get("reviews") or []
    comments = detail.get("comments") or []
    times = [r["submittedAt"] for r in reviews if r.get("submittedAt")]
    times += [c["createdAt"] for c in comments if c.get("createdAt")]
    first = min(times, default=None)
    fixes = 0
    if first:
        fixes = sum(1 for c in detail.get("commits") or [] if c["committedDate"] > first)
    return {
        "pr": n,
        "title": pr["title"],
        "merged_at": pr["mergedAt"],
        "branch": pr["headRefName"],
        "issue": issue_of(pr) if issue_of(pr) is not None else "?",
        "issue_tokens": tokens_for(pr, roles_by_issue, projects, usage),
        "ci_runs": gh.run_attempts(pr["headRefName"]),
        "review_comments": len(reviews) + len(comments) + gh.line_comment_count(n),
        "fix_commits": fixes,
        "later_fixes": later_fixes(n, pr["mergedAt"], all_prs),
    }


def existing_prs(csv_path):
    """CSV にある (pr の集合, issue の集合)。"""
    p = Path(csv_path)
    if not p.exists():
        return set(), set()
    with open(p, newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    return {r["pr"] for r in rows}, {r["issue"] for r in rows if r.get("issue")}


def blank_repeated_issues(rows, seen):
    """同じ Issue の 2 行目以降の issue_tokens を空欄にする（合計が重ならないように）。"""
    for r in rows:
        if r["issue"] != "?" and str(r["issue"]) in seen:
            r["issue_tokens"] = ""
        seen.add(str(r["issue"]))
    return rows


def run(since, until, csv_path, reports_path, gh=None, projects=PROJECTS, usage=sum_usage):
    gh = gh or Gh()
    done, seen_issues = existing_prs(csv_path)
    prs = sorted(gh.merged_prs(since, until), key=lambda p: p["mergedAt"])
    todo = [p for p in prs if str(p["number"]) not in done]
    if not todo:
        return []
    all_prs = gh.all_prs()
    roles = load_roles(reports_path)
    rows = [build_row(p, gh, all_prs, roles, projects, usage) for p in todo]
    blank_repeated_issues(rows, seen_issues)
    path = Path(csv_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    new = not path.exists() or path.stat().st_size == 0
    with open(path, "a", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=COLUMNS, lineterminator="\n")
        if new:
            w.writeheader()
        w.writerows(rows)
    return rows


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--since", required=True)
    ap.add_argument("--until", required=True)
    ap.add_argument("--csv", default=str(DEFAULT_CSV))
    ap.add_argument("--reports", default=os.environ.get("PR_COST_REPORTS", str(DEFAULT_REPORTS)))
    a = ap.parse_args(argv)
    rows = run(a.since, a.until, a.csv, a.reports)
    unk = sum(1 for r in rows if r["issue_tokens"] == "?")
    print(f"追記 {len(rows)} 行（issue_tokens が ? の行 {unk}）→ {a.csv}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
