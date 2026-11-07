import datetime as dt
import importlib.util
import json
import os
import re
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
        self.assertEqual(rows[3]["status"], "merged")  # Issue が開いていて PR がマージ済み（暫定の表示）
        self.assertEqual(model()["counts"], {"todo": 4, "wip": 1, "review": 1, "merged": 1})

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

    def test_summary_shares_alert_logic(self):
        m = model()  # 今日 11/5
        sm = bp.build_summary(m, "2026-11-05T00:00:00+09:00", sample=True)
        self.assertEqual((sm["total"], sm["closed"]), (9, 2))
        self.assertEqual((sm["overdue"], sm["dueSoon"]), (1, 2))  # #3 遅延 / #4・#5 あと2日（alerts と同じ）
        self.assertEqual(sm["overdue"] + sm["dueSoon"], len(m["alerts"]))
        by = {p["name"]: p for p in sm["byPerson"]}
        self.assertEqual(by["だーあさ"], {"name": "だーあさ", "closed": 1, "open": 2, "overdue": 0})
        self.assertEqual(by["りゅうちゃん"]["overdue"], 1)
        self.assertEqual(by[bp.NO_ASSIGNEE]["open"], 2)
        self.assertEqual([p["title"] for p in sm["phases"]], ["1 5文書", "2 実装①", "3 実装②", "4 評価・受入"])
        self.assertEqual(sm["phases"][0], {"title": "1 5文書", "closed": 2, "total": 3})
        self.assertTrue(sm["sample"])

    def test_summary_has_no_account_names(self):
        txt = json.dumps(bp.build_summary(model(), "x"), ensure_ascii=False)
        for acct in ("Hiroki0023", "re-ji-tech0", "matsuki24335", "@"):
            self.assertNotIn(acct, txt)

    def test_recent_prs_ten_default_newest_first_and_others(self):
        prs = model()["merged_prs"]
        self.assertEqual(len(prs), 10)  # 13件マージ済みのうち新しい10件
        self.assertEqual([x["at"] for x in prs], sorted((x["at"] for x in prs), reverse=True))
        allp = bp.build_model(json.load(open(os.path.join(D, "testdata", "progress-sample.json"), encoding="utf-8"))["issues"],
                              [], NAMES, dt.date(2026, 11, 5))["merged_prs"]
        self.assertTrue(all(x["author"] in set(NAMES.values()) | {bp.OTHER} for x in allp))  # 名前の対応表に無い人は「その他」
        self.assertIn(bp.OTHER, {x["author"] for x in allp})

    def test_prs_table_and_sort_hooks(self):
        out = bp.render(model(), "x")
        a = out.index('id="prs"')
        self.assertEqual(out[a:].count("<tr data-a="), 10)
        self.assertIn('data-k="a">担当者', out)
        self.assertIn('aria-sort="descending"', out)  # 既定はマージ日時の新しい順
        self.assertIn('id="prs"', out.split("<script>")[0])
        self.assertNotIn("http://", out.split("<body>")[1])  # 外部読み込みなし

    def test_cards_folded_with_area_counts(self):
        out = bp.render(model(), "x")
        self.assertIn("<details><summary>内訳を開く", out)
        self.assertNotIn("<details open", out)
        self.assertIn("画面 0／1", out)
        self.assertIn("<h1>進捗ダッシュボード", out)

    def test_visible_text_has_display_names_only(self):
        out = bp.render(model(), "x")
        visible = re.sub(r"<script.*?</script>|<style.*?</style>|<[^>]+>", " ", out, flags=re.S)
        for acct in ("Hiroki0023", "re-ji-tech0", "matsuki24335", "guest-dev"):
            self.assertNotIn(acct, visible)

    def test_stage_breakdown_rows_and_empty_stage(self):
        m = model()
        st = {x["title"]: x for x in m["stages"]}
        self.assertEqual([r["number"] for r in st["1 5文書"]["rows"]], [1, 2, 3])
        out = bp.render(m, "x")
        sec = out[out.index('class="stg2"'):out.index('id="al"') if out.index('id="al"') > out.index('class="stg2"') else None]
        self.assertIn("内訳を開く（3件）", sec)
        self.assertNotIn("<details open", sec)
        self.assertIn("#3 [B2] 仕様のデータ項目を確定する", sec)  # 行は担当カードの内訳と同じ形
        self.assertIn("りゅうちゃん", sec)  # 担当の表示名
        # 0件の段は開くボタンを出さない
        d = json.load(open(os.path.join(D, "testdata", "progress-sample.json"), encoding="utf-8"))
        d["milestones"].append({"number": 9, "title": "5 空の段階", "due_on": "2026-11-28T14:59:59Z"})
        out2 = bp.render(bp.build_model(d["issues"], d["milestones"], NAMES, dt.date(2026, 11, 5)), "x")
        i = out2.index("5 空の段階")
        li = out2[i:out2.index("</li>", i)]
        self.assertNotIn("<details>", li)
        self.assertIn("0／0", li)

    def test_sort_buttons_for_narrow_width(self):
        out = bp.render(model(), "x")
        self.assertIn('class="sortbar"', out)
        self.assertIn('data-k="t" aria-pressed="true">マージ日時', out)
        self.assertIn('data-k="a" aria-pressed="false">担当者', out)
        self.assertIn("@media(max-width:700px){#prs .sortbar{display:flex}}", out)

    def test_empty_and_escape(self):
        self.assertIn("まだ Issue がありません", bp.render(model(data="progress-empty.json"), "x"))
        out = bp.render(bp.build_model(
            [{"number": 1, "title": "<script>x</script>", "state": "open", "html_url": "https://github.com/a/b/issues/1",
              "assignees": [], "milestone": None}], [], {}, dt.date(2026, 11, 5)), "x")
        self.assertNotIn("<script>x", out)


if __name__ == "__main__":
    unittest.main()
