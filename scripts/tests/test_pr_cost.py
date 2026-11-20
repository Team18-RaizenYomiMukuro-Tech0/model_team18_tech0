"""scripts/pr-cost.py の単体テスト（gh と記録の読み込みは差し替え）。"""
import csv
import importlib.util
import json
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "pr-cost.py"
spec = importlib.util.spec_from_file_location("pr_cost", SRC)
pc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pc)

PR = {"number": 10, "title": "chore: [#557] x", "mergedAt": "2026-11-18T00:00:00Z",
      "headRefName": "chore/557-x"}


class FakeGh:
    def __init__(self, prs, details=None):
        self.prs, self.details = prs, details or {}

    def merged_prs(self, since, until):
        return self.prs

    def all_prs(self):
        return [{"number": 11, "body": "#10 の直し", "createdAt": "2026-11-19T00:00:00Z"},
                {"number": 12, "body": "#100 の件", "createdAt": "2026-11-19T00:00:00Z"},
                {"number": 13, "body": "#10", "createdAt": "2026-11-17T00:00:00Z"}]

    def detail(self, n):
        return self.details.get(n, {"reviews": [{"submittedAt": "2026-11-17T01:00:00Z"}] * 2,
                                    "commits": [{"committedDate": "2026-11-17T00:00:00Z"},
                                                {"committedDate": "2026-11-17T02:00:00Z"}]})

    def line_comment_count(self, n):
        return 3

    def run_attempts(self, b):
        return 4


def test_u01_issue_of_branch_then_title():
    assert pc.issue_of(PR) == 557
    assert pc.issue_of({"title": "[テスト] #240 x", "headRefName": "eval-x"}) == 240
    assert pc.issue_of({"title": "docs: x", "headRefName": "docs/adr"}) is None


def test_u02_later_fixes_counts_only_later_exact_number():
    assert pc.later_fixes(10, PR["mergedAt"], FakeGh([]).all_prs()) == 1


def test_u03_row_counts():
    row = pc.build_row(PR, FakeGh([PR]), FakeGh([]).all_prs(), {})
    assert (row["review_comments"], row["fix_commits"], row["ci_runs"], row["later_fixes"]) == (5, 1, 4, 1)
    assert row["tokens"] == "?"


def test_u04_no_review_means_zero_fix_commits():
    g = FakeGh([PR], {10: {"reviews": [], "commits": [{"committedDate": "2026-11-20T00:00:00Z"}]}})
    assert pc.build_row(PR, g, [], {})["fix_commits"] == 0


def test_u05_sum_usage_dedupes_and_ignores_text(tmp_path):
    f = tmp_path / "s.jsonl"
    u = {"input_tokens": 1, "output_tokens": 2, "cache_creation_input_tokens": 3, "cache_read_input_tokens": 4}
    line = json.dumps({"requestId": "r", "message": {"id": "m", "usage": u, "content": "秘密"}})
    f.write_text("\n".join([line, line, "壊れた行", json.dumps({"type": "user"})]), encoding="utf-8")
    assert pc.sum_usage([str(f)]) == 10


def test_u06_tokens_link_via_reports_and_dir(tmp_path):
    rep = tmp_path / "reports.jsonl"
    rep.write_text(json.dumps({"session": "model-team18-tech0-terao", "issue": 557, "text": "x"}) + "\n")
    roles = pc.load_roles(rep)
    assert roles == {557: {"terao"}}
    d = tmp_path / (pc.PROJECT_PREFIX + "--command-center-worktrees-557-terao")
    d.mkdir()
    (d / "a.jsonl").write_text(json.dumps({"requestId": "r", "message": {"id": "m", "usage": {"input_tokens": 7}}}))
    assert pc.tokens_for(PR, roles, tmp_path) == 7
    assert pc.tokens_for({**PR, "headRefName": "x/999-y", "title": "t"}, roles, tmp_path) == "?"
    assert pc.tokens_for(PR, {557: {"kurosu"}}, tmp_path) == "?"


def test_u07_idempotent_csv(tmp_path):
    out = tmp_path / "m" / "pr-cost.csv"
    g = FakeGh([PR])
    assert len(pc.run("a", "b", out, tmp_path / "none.jsonl", g, tmp_path)) == 1
    assert pc.run("a", "b", out, tmp_path / "none.jsonl", g, tmp_path) == []
    rows = list(csv.DictReader(open(out, encoding="utf-8")))
    assert len(rows) == 1 and list(rows[0].keys()) == pc.COLUMNS
