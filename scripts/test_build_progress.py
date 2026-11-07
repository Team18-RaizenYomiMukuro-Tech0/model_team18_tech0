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

    def test_status_three_kinds(self):
        rows = {r["number"]: r for p in model()["people"] for r in p["rows"]}
        self.assertEqual(rows[5]["status"], "todo")    # つながる PR なし
        self.assertEqual(rows[4]["status"], "wip")     # Draft の PR #23
        self.assertEqual(rows[6]["status"], "review")  # Ready の PR #21
        self.assertEqual(rows[1]["status"], "done")
        self.assertEqual(rows[3]["status"], "todo")    # マージ済み PR だけでは作業中にしない
        self.assertEqual(model()["counts"], {"todo": 5, "wip": 1, "review": 1})

    def test_alerts_late_and_within_two_days(self):
        m = model()  # 今日 11/5
        self.assertEqual([r["number"] for r in m["alerts"]], [3, 4, 5])  # 10/31 遅延5日・11/7 あと2日×2（完了は除く）
        self.assertTrue(all(not r["done"] for r in m["alerts"]))
        self.assertEqual([r["number"] for r in model("2026-11-04")["alerts"]], [3])  # 11/7 はあと3日 → まだ出ない
        self.assertEqual([r["number"] for r in model("2026-11-07")["alerts"]], [3, 4, 5])  # 当日も「今日が期限」で出る

    def test_stage_period_and_left(self):
        st = {s["title"]: s for s in model()["stages"]}
        self.assertEqual((st["1 5文書"]["start"], st["1 5文書"]["left"]), (None, -5))
        self.assertEqual(st["2 実装①"]["start"], dt.date(2026, 11, 1))
        self.assertEqual(st["2 実装①"]["left"], 2)
        self.assertEqual(st["3 実装②"]["start"], dt.date(2026, 11, 8))

    def test_members_ids_and_buttons(self):
        m = model()
        self.assertEqual([x["id"] for x in m["members"]], ["hiroki0023", "re-ji-tech0", "matsuki24335"])
        out = bp.render(m, "x")
        for n in ("全員", "だーあさ", "レージ", "りゅうちゃん"):
            self.assertIn(">%s</button>" % n, out)
        self.assertIn('data-who="hiroki0023"', out)
        self.assertIn('id="al"', out)
        self.assertIn("遅れ・期限が近い", out)

    def test_no_alerts_shows_none(self):
        i = {"number": 1, "title": "t", "state": "open", "html_url": "https://github.com/a/b/issues/1",
             "milestone": None, "assignees": []}
        out = bp.render(bp.build_model([i], [], NAMES, dt.date(2026, 11, 5)), "x")
        self.assertIn('<p class="none">なし</p>', out)

    def test_empty_and_escape(self):
        self.assertIn("まだ Issue がありません", bp.render(model(data="progress-empty.json"), "x"))
        out = bp.render(bp.build_model(
            [{"number": 1, "title": "<script>x</script>", "state": "open", "html_url": "https://github.com/a/b/issues/1",
              "assignees": [], "milestone": None}], [], {}, dt.date(2026, 11, 5)), "x")
        self.assertNotIn("<script>x", out)


if __name__ == "__main__":
    unittest.main()
