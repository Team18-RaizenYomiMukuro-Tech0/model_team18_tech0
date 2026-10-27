import datetime as dt
import importlib.util
import json
import os
import unittest

D = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("bp", os.path.join(D, "build-progress.py"))
bp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bp)
NAMES = {"Hiroki0023": "だーあさ", "re-ji-tech0": "レージ", "matsuki24335": "りゅうちゃん"}


def model(today="2026-11-05", data="progress-sample.json"):
    d = json.load(open(os.path.join(D, "testdata", data), encoding="utf-8"))
    return bp.build_model(d["issues"], d["milestones"], NAMES, dt.date.fromisoformat(today))


class T(unittest.TestCase):
    def test_counts_issues_only(self):
        m = model()
        self.assertEqual((m["total"], m["done"]), (9, 2))

    def test_late_uses_milestone_due_jst(self):
        rows = {r["number"]: r for p in model()["people"] for r in p["rows"]}
        self.assertEqual(rows[3]["late"], 5)  # 期限 10/31(JST)、今日 11/5 → 5日
        self.assertEqual(rows[5]["late"], 0)  # 期限 11/7
        self.assertEqual(rows[1]["late"], 0)  # 完了は遅延にしない
        self.assertEqual(rows[9]["late"], 0)  # 期限 11/21

    def test_names_and_fallback(self):
        names = [p["name"] for p in model()["people"]]
        self.assertEqual(sorted(names[:-1]), sorted(["だーあさ", "レージ", "りゅうちゃん"]))
        self.assertEqual(names[-1], bp.NO_ASSIGNEE)

    def test_non_member_goes_to_undecided(self):
        i = {"number": 1, "title": "t", "state": "open", "html_url": "https://github.com/a/b/issues/1",
             "milestone": None, "assignees": [{"login": "guest-dev"}]}
        m = bp.build_model([i], [], NAMES, dt.date(2026, 11, 5))
        self.assertEqual([p["name"] for p in m["people"]], [bp.NO_ASSIGNEE])
        self.assertEqual(m["total"], 1)

    def test_sample_label_only_with_flag(self):
        self.assertIn("ダミーデータの表示例", bp.render(model(), "x", sample=True))
        self.assertNotIn("ダミーデータの表示例", bp.render(model(), "x"))

    def test_pr_linked_not_counted(self):
        rows = {r["number"]: r for p in model()["people"] for r in p["rows"]}
        self.assertEqual([x["number"] for x in rows[3]["prs"]], [20])
        self.assertEqual(rows[5]["prs"], [])  # マージされず閉じた PR は出さない

    def test_empty_and_escape(self):
        self.assertIn("まだ Issue がありません", bp.render(model(data="progress-empty.json"), "x"))
        out = bp.render(bp.build_model(
            [{"number": 1, "title": "<script>x</script>", "state": "open", "html_url": "https://github.com/a/b/issues/1",
              "assignees": [], "milestone": None}], [], {}, dt.date(2026, 11, 5)), "x")
        self.assertNotIn("<script>x", out)


if __name__ == "__main__":
    unittest.main()
