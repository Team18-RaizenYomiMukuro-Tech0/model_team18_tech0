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
        self.assertIn("🔥 いま動くこと", out)

    def test_no_alerts_shows_none(self):
        i = {"number": 1, "title": "t", "state": "open", "html_url": "https://github.com/a/b/issues/1",
             "milestone": None, "assignees": []}
        out = bp.render(bp.build_model([i], [], NAMES, dt.date(2026, 11, 5)), "x")
        self.assertIn('<p class="none">いま急ぐものはありません 🎉</p>', out)

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
        self.assertEqual({k: sm["phases"][0][k] for k in ("title", "closed", "total")}, {"title": "1 5文書", "closed": 2, "total": 3})  # 既存のキーは変えない
        self.assertTrue(sm["sample"])

    def test_summary_gauge_fields(self):
        sm = bp.build_summary(model(), "x")
        ph = {x["title"]: x for x in sm["phases"]}
        self.assertEqual((ph["1 5文書"]["start"], ph["1 5文書"]["due"]), (None, "2026-10-31"))  # 最初の段階は start なし
        self.assertEqual((ph["2 実装①"]["start"], ph["2 実装①"]["due"]), ("2026-11-01", "2026-11-07"))
        self.assertEqual(ph["1 5文書"]["merged_open"], 1)  # #3: PR マージ済み・Issue 未完了
        self.assertEqual([ph[k]["merged_open"] for k in ("2 実装①", "3 実装②", "4 評価・受入")], [0, 0, 0])
        for x in sm["phases"]:  # 既存のキーはそのまま
            self.assertTrue({"title", "closed", "total"} <= set(x))
        self.assertEqual(sm["today"], {"gain": 0, "merged": 0, "closed": 0})  # 今日 11/5 は動きなし
        for k in ("updatedAt", "total", "closed", "overdue", "dueSoon", "byPerson", "phases"):
            self.assertIn(k, sm)

    def test_summary_today_counts_jst_and_no_due(self):
        iss = [
            {"number": 1, "title": "a", "state": "closed", "html_url": "u", "closed_at": "2026-11-04T16:00:00Z", "assignees": [], "milestone": None},  # JST 11/5 01:00 → 今日
            {"number": 2, "title": "b", "state": "closed", "html_url": "u", "closed_at": "2026-11-05T15:30:00Z", "assignees": [], "milestone": None},  # JST 11/6 → 今日でない
            {"number": 3, "title": "c", "state": "closed", "html_url": "u", "assignees": [], "milestone": None},  # closed_at なしでも落ちない
            {"number": 10, "title": "p", "state": "closed", "html_url": "u", "pull_request": {"merged_at": "2026-11-05T01:00:00Z"}, "user": {"login": "x"}},
            {"number": 11, "title": "q", "state": "closed", "html_url": "u", "pull_request": {"merged_at": "2026-11-04T14:59:00Z"}, "user": {"login": "x"}},  # JST 11/4 23:59
            {"number": 12, "title": "r", "state": "closed", "html_url": "u", "pull_request": {"merged_at": None}, "user": {"login": "x"}},  # マージされず閉じた
        ]
        ms = [{"number": 1, "title": "M 日付なし", "due_on": None}]
        sm = bp.build_summary(bp.build_model(iss, ms, NAMES, dt.date(2026, 11, 5)), "x")
        self.assertEqual(sm["today"], {"gain": 1, "merged": 1, "closed": 1})  # 今日閉じた #1 だけ（PR 10 は Issue に結ばない）
        self.assertEqual(sm["phases"], [{"title": "M 日付なし", "closed": 0, "total": 0, "start": None, "due": None, "merged_open": 0}])
        # 動きが0件のとき
        empty = bp.build_summary(bp.build_model([], [], NAMES, dt.date(2026, 11, 5)), "x")
        self.assertEqual(empty["today"], {"gain": 0, "merged": 0, "closed": 0})
        self.assertEqual(empty["phases"], [])

    def test_today_gain_counts_issues_once(self):
        def iss(n, state="open", closed=None):
            return {"number": n, "title": "i", "state": state, "html_url": "u", "closed_at": closed, "assignees": [], "milestone": None}
        def pr(n, merged, body):
            return {"number": n, "title": "p", "state": "closed", "html_url": "u", "body": body, "user": {"login": "x"},
                    "pull_request": {"merged_at": merged}}
        T, Y = "2026-11-05T03:00:00Z", "2026-11-04T03:00:00Z"  # 今日 / きのう（JST）
        data = [
            iss(20), iss(21, "closed", T), iss(22), iss(23, "closed", Y), iss(24),
            pr(30, T, "Closes #20"),                 # 今日マージ → 未完了 #20 が進む
            pr(31, T, "Closes #21"),                 # #21 は今日閉じた Issue でもある → 1回だけ
            pr(32, T, "ハブの直し（Issue なし）"),     # Issue に結ばない PR は数えない
            pr(33, Y, "Closes #24"),                 # きのうマージ → 今日は数えない
            pr(34, T, "Closes #22 Closes #20 Closes #999"),  # #20 は2回目・#999 は無い → #22 だけ増える
            pr(35, T, "Closes #23"),                 # #23 はきのう閉じた → 今日は数えない
        ]
        m = bp.build_model(data, [], NAMES, dt.date(2026, 11, 5))
        self.assertEqual(m["today_counts"]["gain"], 3)  # #20, #21, #22
        self.assertEqual((m["today_counts"]["merged"], m["today_counts"]["closed"]), (5, 1))  # 既存の merged/closed は残る
        sm = bp.build_summary(m, "x")
        self.assertEqual(sm["today"], {"gain": 3, "merged": 5, "closed": 1})
        # 0件: PR も Issue も今日の動きなし／Issue に結ばない PR だけ
        only = bp.build_model([iss(1), pr(2, T, "")], [], NAMES, dt.date(2026, 11, 5))
        self.assertEqual(only["today_counts"], {"gain": 0, "merged": 1, "closed": 0})

    def _sort_data(self):
        ms = [{"number": n, "title": t, "due_on": d} for n, t, d in (
            (1, "1 古い", "2026-10-30T00:00:00Z"), (2, "2 きのう", "2026-11-01T00:00:00Z"), (3, "3 今日", "2026-11-05T00:00:00Z"),
            (4, "4 来週", "2026-11-07T00:00:00Z"), (5, "5 再来週", "2026-11-09T00:00:00Z"))]
        mm = {m["number"]: {"number": m["number"], "title": m["title"]} for m in ms}
        def i(n, m, state="open"):
            return {"number": n, "title": "[B%d] 題 %d" % (n % 9, n), "state": state, "html_url": "u", "milestone": mm.get(m),
                    "assignees": [{"login": "re-ji-tech0"}]}
        # 番号順にするとバラバラになる並び: 1 完了(11/1)・2 期限なし・3 11/9・4 11/9（同じ期限）・5 遅れ(11/1)・6 今日・7 11/7・8 もっと遅れ(10/30)
        return [i(1, 2, "closed"), i(2, None), i(3, 5), i(4, 5), i(5, 2), i(6, 3), i(7, 4), i(8, 1)], ms

    def test_breakdown_sorted_by_due(self):
        data, ms = self._sort_data()
        m = bp.build_model(data, ms, NAMES, dt.date(2026, 11, 5))
        rows = [r for p in m["people"] for r in p["rows"]]
        # 遅れ（期限の早い順）→ 今日 → 期限の早い順 → 同じ期限は番号順 → 期限なし → 完了は最後
        self.assertEqual([r["number"] for r in sorted(rows, key=bp.due_order)], [8, 5, 6, 7, 3, 4, 2, 1])
        out = bp.render(m, "x")
        card = out[out.index('data-who="re-ji-tech0"><div class="ph">'):]
        card = card[:card.index("</details>")]
        self.assertEqual([int(x) for x in re.findall(r'class="stt" href="[^"]*">#(\d+) ', card)], [8, 5, 6, 7, 3, 4, 2, 1])
        # 担当者カードの内訳も #86 の形（太枠の箱でなく区切り線の一覧・状態だけ色札・段階と期限は灰色の文字）
        self.assertIn('<ul class="srows">', card)
        self.assertNotIn('<ul class="rows">', card)
        self.assertIn('<span class="sd">1 古い・期限 10/30</span>', card)
        self.assertIn('<span class="sd">3 今日・期限 11/5（今日が期限）</span>', card)
        self.assertIn('<span class="sd">段階なし・期限なし</span>', card)
        self.assertIn('<span class="sb red">遅れ 6日</span>', card)
        self.assertNotIn('class="chip"', card)
        self.assertIn('<span class="ar ar-B">B', card)  # 分野の札はそのまま
        self.assertNotIn("re-ji-tech0", re.sub(r' data-who="[^"]*"', "", " " + card))  # 画面の文字にアカウント名を出さない（絞り込み用の属性は除く）

    def test_stage_breakdown_sorted_same_due_by_number_done_last(self):
        data, ms = self._sort_data()
        for n in (9, 10, 11):  # 同じ段階（5 再来週・期限 11/9）に追加: 完了 #9 / 期限は同じ #11, #10
            data.append({"number": n, "title": "x%d" % n, "state": "closed" if n == 9 else "open", "html_url": "u",
                         "milestone": {"number": 5, "title": "5 再来週"}, "assignees": []})
        m = bp.build_model(data, ms, NAMES, dt.date(2026, 11, 5))
        st = {s["title"]: s for s in m["stages"]}["5 再来週"]
        self.assertEqual([r["number"] for r in sorted(st["rows"], key=bp.due_order)], [3, 4, 10, 11, 9])
        out = bp.render(m, "x")
        sec = out[out.index('class="stg2"'):]
        seg = sec[sec.index("5 再来週"):]
        self.assertEqual([int(x) for x in re.findall(r'class="stt" href="[^"]*">#(\d+) ', seg)][:5], [3, 4, 10, 11, 9])

    def test_github_links_open_in_new_tab(self):
        out = bp.render(model(), "x")
        body = out.split("<body>")[1]
        links = re.findall(r'<a [^>]*>', body)
        gh = [a for a in links if 'href="https://github.com/' in a]
        self.assertGreater(len(gh), 10)  # Issue・PR のリンク（いま動くこと・カード・段階・PR 表）
        for a in gh:
            self.assertIn('target="_blank" rel="noopener"', a)
        for a in links:  # 同じサイトの中（ハブへ戻る）は同じタブのまま
            if 'href="https://github.com/' not in a:
                self.assertNotIn("_blank", a)
        self.assertIn('<a href="hub.html">', body)
        # 表の PR 番号・いま動くこと・段階の内訳・カードのそれぞれに付く
        for key in ('id="al"', 'class="pgrid"', 'class="stg2"', 'id="prs"'):
            seg = body[body.index(key):]
            self.assertIn('target="_blank"', seg[:seg.index("</section>")])

    def _quick(self, issues, milestones):
        m = bp.build_model(issues, milestones, NAMES, dt.date(2026, 11, 5))
        return bp.build_issues_quick(m, issues, NAMES, "2026-11-05T00:00:00+09:00")

    def test_area_code_forms(self):
        # 読める3形: [B1]・[F・R1]（札は F、番号は R1）・[B2b]（英小文字つき）
        self.assertEqual(bp.area_split("[B1] 土台"), ("B", "B1", "土台"))
        self.assertEqual(bp.area_split("[F・R1] 共通ヘッダー"), ("F", "R1", "共通ヘッダー"))
        self.assertEqual(bp.area_split("[B2b] 続き"), ("B", "B2b", "続き"))
        self.assertEqual(bp.area_split("  [T10]  空白あり"), ("T", "T10", "空白あり"))
        # 「・」の後ろは 英大文字1字＋数字（R1 以外も）
        self.assertEqual(bp.area_split("[B・O1] 題"), ("B", "O1", "題"))
        self.assertEqual(bp.area_split("[P・K1] 題"), ("P", "K1", "題"))
        self.assertEqual(bp.area_split("[T・O4] 題"), ("T", "O4", "題"))
        self.assertEqual(bp.area_split("[B・L12] 題"), ("B", "L12", "題"))
        # 読めない形は None（札なし・題はそのまま）
        for bad in ("[R1] だけ", "[X1] 知らない印", "[F・o1] 小文字", "[F・RR1] 2字", "[F・O1b] 小文字つき", "[F・1] R が無い", "[F・R] 数字が無い", "[B2B] 大文字", "[B] 番号なし", "B1 括弧なし", "題 [B1] 途中"):
            self.assertIsNone(bp.area_split(bad), bad)
            self.assertIsNone(bp.AREA_RE.match(bad), bad)
        # 札の HTML（画面）。R1 は札 F の色で R1 と出す
        h, rest = bp.title_parts("[F・R1] 共通ヘッダー", True)
        self.assertEqual((h, rest), ('<span class="ar ar-F">R1</span>', "共通ヘッダー"))
        self.assertEqual(bp.title_parts("[B2b] 続き", True)[0], '<span class="ar ar-B">B2b</span>')
        self.assertEqual(bp.title_parts("[R1] だけ", True), ("", "[R1] だけ"))
        # 領域の数（担当者カードの札）にも入る
        ms = [{"number": 1, "title": "1 一", "due_on": "2026-11-07T00:00:00Z"}]
        def i(n, title):
            return {"number": n, "title": title, "state": "open", "html_url": "https://github.com/o/r/issues/%d" % n,
                    "milestone": {"number": 1, "title": "1 一"}, "body": "", "assignees": [{"login": "Hiroki0023"}]}
        data = [i(1, "[B1] a"), i(2, "[F・R1] b"), i(3, "[B2b] c"), i(4, "[R1] d"), i(5, "[X1] e"), i(6, "[B10] f"), i(7, "[B2] g")]
        m = bp.build_model(data, ms, NAMES, dt.date(2026, 11, 5))
        self.assertEqual({r["number"]: r["area"] for r in m["stages"][0]["rows"]},
                         {1: "B", 2: "F", 3: "B", 4: None, 5: None, 6: "B", 7: "B"})
        # issues-quick.json の code・area。並びは B1 < B2 < B2b < B10、F の R1、読めない形は最後
        q, _ = self._quick(data, ms)
        got = [(x["n"], x["code"], x["area"], x["title"]) for x in q["phases"][0]["issues"]]
        self.assertEqual(got, [(1, "B1", "B", "a"), (7, "B2", "B", "g"), (3, "B2b", "B", "c"), (6, "B10", "B", "f"),
                               (2, "R1", "F", "b"), (4, "", "", "[R1] d"), (5, "", "", "[X1] e")])

    def test_area_code_letter_order_in_issues_quick(self):
        ms = [{"number": 1, "title": "1 一", "due_on": "2026-11-07T00:00:00Z"}]
        def i(n, title):
            return {"number": n, "title": title, "state": "open", "html_url": "https://github.com/o/r/issues/%d" % n,
                    "milestone": {"number": 1, "title": "1 一"}, "body": "", "assignees": [{"login": "Hiroki0023"}]}
        data = [i(1, "[B・R2] a"), i(2, "[B・O1] b"), i(3, "[B10] c"), i(4, "[B・L1] d"), i(5, "[B・R1] e"), i(6, "[B2b] f"),
                i(7, "[P・K1] g"), i(8, "[P・O2] h"), i(9, "[T・O4] i"), i(10, "[B・R10] j")]
        q, _ = self._quick(data, ms)
        got = [(x["code"], x["area"]) for x in q["phases"][0]["issues"]]
        # 分野の順（P→B→T）。同じ分野は 分野の番号 → 文字順の「・」つき（L1 < O1 < R1 < R2 < R10）
        self.assertEqual(got, [("K1", "P"), ("O2", "P"), ("B2b", "B"), ("B10", "B"), ("L1", "B"), ("O1", "B"),
                               ("R1", "B"), ("R2", "B"), ("R10", "B"), ("O4", "T")])

    def test_issues_quick_shape_order_codes_reviewers(self):
        ms = [{"number": 1, "title": "1 一", "due_on": "2026-11-07T00:00:00Z"}, {"number": 2, "title": "2 二", "due_on": "2026-11-11T00:00:00Z"},
              {"number": 3, "title": "3 空", "due_on": None}]
        mm = {m["number"]: {"number": m["number"], "title": m["title"]} for m in ms}
        def i(n, title, m=1, state="open", body="", assignees=("Hiroki0023",)):
            return {"number": n, "title": title, "state": state, "html_url": "https://github.com/o/r/issues/%d" % n,
                    "milestone": mm.get(m), "body": body, "assignees": [{"login": a} for a in assignees]}
        tpl = "## 👀 Reviewer\n<!-- 例: @設計変更を出した人 -->\n- @Matsuki24335 と @re-ji-tech0 と @stranger\n\n## 👤 担当・期限\n- @other-after-section"
        data = [
            i(9, "コード無しの題", 1), i(8, "[T1] テスト", 1), i(7, "[F0] 画面", 1), i(6, "[B2] 後の B", 1), i(5, "[B1] 先の B", 1, "closed", tpl),
            i(4, "[P1] PM", 1), i(30, "[B10] 番号は数として並べる", 1), i(31, "[X9] 知らない印", 1),
            i(10, "[B1] 二段目", 2, assignees=("re-ji-tech0", "ghost")),
            i(11, "マイルストーンなし", None),
            {"number": 12, "title": "[P9] PR は含めない", "state": "closed", "html_url": "u", "milestone": mm[1], "pull_request": {"merged_at": None}},
        ]
        q, hidden = self._quick(data, ms)
        self.assertEqual(q["updatedAt"], "2026-11-05T00:00:00+09:00")
        self.assertEqual([p["title"] for p in q["phases"]], ["1 一", "2 二", "3 空", "その他"])  # 段階の並びは phases と同じ・なしは「その他」
        sm = {p["title"]: p for p in bp.build_summary(bp.build_model(data, ms, NAMES, dt.date(2026, 11, 5)), "x")["phases"]}
        for p in q["phases"][:3]:  # start / due は summary の phases と同じ
            self.assertEqual((p["start"], p["due"]), (sm[p["title"]]["start"], sm[p["title"]]["due"]))
        p1 = q["phases"][0]["issues"]
        # P → B → F → T の順、同じ分野は番号を数として（B1 < B2 < B10）、コード無しは最後（番号順）
        self.assertEqual([x["n"] for x in p1], [4, 5, 6, 30, 7, 8, 9, 31])
        self.assertNotIn(12, [x["n"] for x in p1])  # PR は含めない
        b1 = p1[1]
        self.assertEqual((b1["n"], b1["code"], b1["area"], b1["title"]), (5, "B1", "B", "先の B"))  # 題から [B1] を外す
        self.assertEqual(b1["assignees"], ["だーあさ"])
        self.assertEqual(b1["reviewers"], ["りゅうちゃん", "レージ"])  # 本文の Reviewer 節だけ・大文字小文字は区別しない・節の外と表示名のない人は出さない
        self.assertTrue(b1["closed"] and b1["url"].startswith("https://github.com/"))
        self.assertEqual([(x["code"], x["area"], x["title"]) for x in p1 if x["n"] in (9, 31)],
                         [("", "", "コード無しの題"), ("", "", "[X9] 知らない印")])  # 頭に [P/B/F/T数字] が無ければ code 空・題はそのまま
        self.assertEqual(set(b1), {"n", "code", "area", "title", "assignees", "reviewers", "closed", "url"})
        self.assertEqual(q["phases"][1]["issues"][0]["assignees"], ["レージ"])  # 表示名のない ghost は出さない
        self.assertEqual(q["phases"][2]["issues"], [])
        self.assertEqual(hidden, 2)  # stranger（レビュアー）と ghost（担当）の数だけ。名前は出さない
        txt = json.dumps(q, ensure_ascii=False)
        for acct in ("Hiroki0023", "re-ji-tech0", "matsuki24335", "stranger", "ghost", "@"):
            self.assertNotIn(acct, txt)

    def test_issues_quick_no_other_phase_when_empty_and_sample_flag(self):
        q, hidden = self._quick([], [])
        self.assertEqual((q["phases"], hidden), ([], 0))
        d = json.load(open(os.path.join(D, "testdata", "progress-sample.json"), encoding="utf-8"))
        m = bp.build_model(d["issues"], d["milestones"], NAMES, dt.date(2026, 11, 5))
        q, _ = bp.build_issues_quick(m, d["issues"], NAMES, "x", sample=True)
        self.assertTrue(q["sample"])
        self.assertNotIn("その他", [p["title"] for p in q["phases"]][:4])
        self.assertEqual(sum(len(p["issues"]) for p in q["phases"]), 9)  # Issue だけ（PR は数えない）

    def test_summary_has_no_account_names(self):
        txt = json.dumps(bp.build_summary(model(), "x"), ensure_ascii=False)
        for acct in ("Hiroki0023", "re-ji-tech0", "matsuki24335", "@"):
            self.assertNotIn(acct, txt)

    def test_review_pr_shows_author_and_reviewer(self):
        d = json.load(open(os.path.join(D, "testdata", "progress-sample.json"), encoding="utf-8"))
        rv = {p["number"]: [r["login"] for r in p.get("requested_reviewers", [])] for p in d["issues"]}
        m = bp.build_model(d["issues"], d["milestones"], NAMES, dt.date(2026, 11, 5), rv)
        p = [x for x in m["review_prs"] if x["number"] == 21][0]
        self.assertEqual(p["reviewers"], ["だーあさ"])
        self.assertEqual(p["who"].split(), ["re-ji-tech0", "hiroki0023"])  # 作成者と Reviewer の両方に出る
        html = bp.now_section(m)
        self.assertIn("作成: レージ", html)
        self.assertIn("レビュー: だーあさ", html)
        # Reviewer がいなければ「未指定」
        m2 = bp.build_model(d["issues"], d["milestones"], NAMES, dt.date(2026, 11, 5))
        self.assertIn("レビュー: 未指定", bp.now_section(m2))

    def test_recent_prs_ten_default_newest_first_and_others(self):
        prs = model()["merged_prs"]
        self.assertEqual(len(prs), 10)  # 13件マージ済みのうち新しい10件
        self.assertEqual([x["at"] for x in prs], sorted((x["at"] for x in prs), reverse=True))
        allp = bp.build_model(json.load(open(os.path.join(D, "testdata", "progress-sample.json"), encoding="utf-8"))["issues"],
                              [], NAMES, dt.date(2026, 11, 5))["merged_prs"]
        self.assertTrue(all(x["author"] in set(NAMES.values()) | {bp.OTHER} for x in allp))  # 名前の対応表に無い人は「その他」
        self.assertIn(bp.OTHER, {x["author"] for x in allp})

    def _many(self):
        iss = []
        for n in range(1, 41):  # だーあさ 15件 / レージ 12件 / りゅうちゃん 3件 / 他 10件。番号が大きいほど新しい
            u = "Hiroki0023" if n % 4 in (0, 1) and n <= 30 else "matsuki24335" if n in (3, 7, 11) else "re-ji-tech0" if n % 4 in (2, 3) and n <= 30 else "stranger"
            iss.append({"number": n, "title": f"PR {n}", "state": "closed", "html_url": f"https://github.com/o/r/pull/{n}",
                        "user": {"login": u}, "pull_request": {"merged_at": f"2026-10-{(n % 28) + 1:02d}T0{n % 10}:00:00Z"}, "labels": []})
        return bp.build_model(iss, [], NAMES, dt.date(2026, 11, 5))

    def test_pool_is_ten_per_member_plus_overall(self):
        m = self._many()
        pool = m["merged_pool"]
        self.assertEqual(len({x["number"] for x in pool}), len(pool))  # 重複なし
        for who in ("hiroki0023", "re-ji-tech0"):
            self.assertEqual(sum(1 for x in pool if x["who"] == who), 10)
        self.assertLessEqual(sum(1 for x in pool if x["who"] == "matsuki24335"), 10)
        self.assertEqual(sum(1 for x in pool if x["top"]), 10)
        for x in m["merged_prs"]:
            self.assertIn(x["number"], {y["number"] for y in pool})
        # 「その他」は全体の最近10件にいるときだけ
        self.assertEqual(sum(1 for x in pool if x["who"] == "none"), 10)  # 「その他」も最近10件
        self.assertLessEqual(len(pool), 10 + 4 * 10)

    def test_rows_carry_who_and_filter_js_limits_table(self):
        out = bp.render(self._many(), "x")
        a = out.index('id="prs"')
        self.assertIn('data-who="hiroki0023"', out[a:])
        self.assertIn('id="prn"', out)
        self.assertIn('#prs tbody', out)
        self.assertIn('data-top', out.split("<script>", 1)[1])
        # 表専用の名前ボタン: 表の上、全員｜3人｜その他。上のボタン（#who）とは別の ID・別の保存キー
        self.assertIn('id="prwho"', out)
        self.assertLess(out.index('id="prwho"'), out.index('<table>'))
        pw = out[out.index('id="prwho"'):out.index('<table>')]
        self.assertEqual([x for x in re.findall(r'hidden>([^<]+)</button>', pw)], ["全員", "だーあさ", "レージ", "りゅうちゃん", bp.OTHER])
        js = out[out.index("progress-prwho") - 400:]
        self.assertNotIn('"#prs', bp.FILTER_JS)  # 上のボタンの JS は PR 表に触らない
        self.assertNotIn("prs", bp.FILTER_JS)
        self.assertIn("progress-prwho", out)
        self.assertNotIn("progress-who", bp.PRWHO_JS)
        self.assertEqual(out[a:].count('data-top="0" hidden>'), out[a:].count('data-top="0"'))  # 全員表示では全体の10件だけ見える

    def test_prs_table_and_sort_hooks(self):
        out = bp.render(model(), "x")
        a = out.index('id="prs"')
        self.assertGreaterEqual(out[a:].count("<tr data-a="), 10)
        self.assertEqual(out[a:].count('data-top="1"'), 10)  # 「全員」で見える行は全体の最近10件
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
        self.assertIn("#3 仕様のデータ項目を確定する", sec)  # 題の頭の [B2] は分野の札になる（札は別の要素）
        self.assertIn('<span class="ar ar-B">B2</span>', sec)
        self.assertIn("りゅうちゃん", sec)  # 担当の表示名
        # 0件の段は開くボタンを出さない
        d = json.load(open(os.path.join(D, "testdata", "progress-sample.json"), encoding="utf-8"))
        d["milestones"].append({"number": 9, "title": "5 空の段階", "due_on": "2026-11-28T14:59:59Z"})
        out2 = bp.render(bp.build_model(d["issues"], d["milestones"], NAMES, dt.date(2026, 11, 5)), "x")
        i = out2.index("5 空の段階")
        li = out2[i:out2.index("</li>", i)]
        self.assertNotIn("<details>", li)
        self.assertIn("Issue なし", li)  # 0件の段は「0／0（0%）」でなく「Issue なし」
        self.assertNotIn("0／0", li)

    def test_stage_breakdown_row_style(self):
        out = bp.render(model(), "x")
        sec = out[out.index('class="stg2"'):out.index('id="prs"')]
        self.assertNotIn('<ul class="rows">', sec)  # 太枠の箱をやめ、区切り線の一覧
        self.assertIn('class="srows"', sec)
        self.assertIn("レージ・期限 11/", sec)  # 担当と期限は小さい灰色の文字
        self.assertIn("りゅうちゃん・期限 10/31", sec)
        for k in ("gray", "blue", "green", "red"):
            self.assertIn('class="sb ' + k, sec)  # 札は状態だけ（未着手=灰・作業中=青・マージ済み=緑・遅れ=赤）
        inner = "".join(re.findall(r'<ul class="srows">.*?</ul>', sec, re.S))
        self.assertNotIn('class="chip"', inner)  # 内訳の中に札（チップ）はない
        self.assertNotIn("Hiroki0023", sec)

    def test_status_badge_contrast_at_least_4_5(self):
        def lum(h):
            c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
            c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
            return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
        for k in ("gray", "blue", "green", "red"):
            m = re.search(r"\.sb\." + k + r"\{background:(#\w+);color:(#\w+)\}", bp.CSS if hasattr(bp, "CSS") else open(bp.__file__).read())
            self.assertIsNotNone(m, k)
            a, b = sorted((lum(m.group(1)), lum(m.group(2))), reverse=True)
            self.assertGreaterEqual((a + 0.05) / (b + 0.05), 4.5, k)

    def test_stage_colors_and_waza_names(self):
        out = bp.render(model(), "x")
        sec = out[out.index('class="stg2"'):out.index('id="prs"')]
        for n, w in (("1", "霊気"), ("2", "霊丸"), ("3", "霊光波動"), ("4", "魔族覚醒")):
            self.assertRegex(sec, r'<li class="w%s"><span class="sn">%s [^<]*<b>%s</b></span>' % (n, n, w))
        self.assertIn("2 実装① <b>霊丸</b>", sec)
        self.assertIn('<li><span class="sn">段階なし</span>', sec)  # 段階の無いものは色なし・技名なし
        # 色の値はハブの霊力ゲージ（docs/hub.html）と同じ: 黄 m1 / 水色 m2 / ピンク m3 / 白
        hub = open(os.path.join(D, "..", "docs", "hub-assets", "band.css"), encoding="utf-8").read()  # ゲージの CSS（上部は共通ファイル）
        kb = open(os.path.join(D, "..", "docs", "kb", "kb.css"), encoding="utf-8").read()
        for tok, hexv in (("m1", "#FFD700"), ("m2", "#40E0D0"), ("m3", "#FF69B4")):
            self.assertIn("--%s:%s" % (tok, hexv), kb)
        self.assertIn("var(--m1) 0 25%,var(--m2) 25% 50%,var(--m3) 50% 75%,var(--m1) 75%,var(--m2) 87.5%,var(--m3) 100%", hub)
        self.assertIn("linear-gradient(to right,var(--m1),var(--m2),var(--m3))", hub)  # STAGE 4 の札のふちは同じ3色のグラデーション（文字のグラデ塗りはしない）
        self.assertNotIn("background-clip:text", hub)
        self.assertIn("background:var(--band)", hub)  # 札の地は濃い紺
        self.assertNotIn("#fff 75% 100%", hub)
        self.assertIn("class=\"glow\"", open(os.path.join(D, "..", "docs", "hub-assets", "band.js"), encoding="utf-8").read())  # 右端は魔界の門（扉は進み具合で開く）
        self.assertIn(".stg2 li.w4 .sn{border-color:transparent;background:linear-gradient(#2A1B3D,#2A1B3D) padding-box,linear-gradient(to right,var(--m1),var(--m2),var(--m3)) border-box;color:#FFFFFF}", out)  # 紺の地＋3色のふち・白文字
        self.assertIn(".stg2 li.w4 .bar i{background:linear-gradient(to right,var(--m1),var(--m2),var(--m3))}", out)  # 溜まった分だけ3色
        self.assertIn(".stg2 li[class] .sn{white-space:nowrap}", out)
        self.assertIn(".stg2 li.w1 .bar,.stg2 li.w2 .bar,.stg2 li.w3 .bar,.stg2 li.w4 .bar{height:8px;border:0;background:var(--tint)}", out)  # 4段とも細く薄い紫の地（STAGE 4 は札だけ紺）
        self.assertIn(".stg2 li.w1 .sn,.stg2 li.w2 .sn,.stg2 li.w3 .sn{border:0;background:color-mix(in srgb,var(--c) 30%,transparent);color:#2A1B3D}", out)  # 段1〜3の札は枠なしの薄い塗り
        self.assertIn(".stg2>ul>li>.chip{border:0;background:none;padding:0;color:var(--ctext)}", out)  # 日付は枠なしの文字

    def test_area_badges(self):
        out = bp.render(model(), "x")
        # 題から外れる（いま動くこと・担当者カードの内訳・段階の内訳）。札の文字は B2 のまま
        now = out[out.index('id="al"'):out.index('class="pgrid"')]
        self.assertIn('⚠ <span class="ar ar-B">B2</span><a href=', now)
        self.assertIn("#3 仕様のデータ項目を確定する", now)
        self.assertNotIn("[B2]", now)
        self.assertNotIn("[F1]", now)
        self.assertIn('class="st late"', now)  # 状態の札は従来どおり
        self.assertIn("PR #21 feat: API の骨組み", now)  # レビュー待ちの PR の題はそのまま
        cards = out[out.index('class="pgrid"'):out.index('class="stg2"')]
        self.assertIn('<span class="ar ar-B">B2</span><a class="stt" href="', cards)
        self.assertNotIn("[B2]", cards)
        for k, n in (("P", "P1"), ("F", "F1"), ("T", "T1")):
            self.assertIn('<span class="ar ar-%s">%s</span>' % (k, n), out)
        # 担当者カードの分野の内訳の札も同じ色のクラス
        self.assertIn('class="chip ar ar-P">PM ', cards)
        self.assertIn('class="chip ar ar-B">DB・API ', cards)
        # 頭に [..] が無い題はそのまま
        self.assertEqual(bp.title_parts("担当がまだ決まっていない作業", True), ("", "担当がまだ決まっていない作業"))
        self.assertEqual(bp.title_parts("[X9] 別の印", True), ("", "[X9] 別の印"))
        self.assertEqual(bp.title_parts("[B2] 題", False), ("", "[B2] 題"))
        self.assertNotIn("Hiroki0023", out)

    def test_color_contrast_area_and_stage(self):
        def lum(h):
            c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
            c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
            return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
        def ratio(a, b):
            x, y = sorted((lum(a), lum(b)), reverse=True)
            return (x + 0.05) / (y + 0.05)
        src = open(bp.__file__, encoding="utf-8").read()
        for k in "PBFT":  # 分野の札の文字色（枠も同色）: 白い背景・行の薄い紫の背景の上で 4.5:1 以上
            c = re.search(r"\.ar-%s\{color:(#\w+)\}" % k, src).group(1)
            for bg in ("#FFFFFF", "#F3EDFB"):
                self.assertGreaterEqual(ratio(c, bg), 4.5, (k, bg))
        for c in ("#FFD700", "#40E0D0", "#FF69B4"):  # 段階の見出しの地の色 × 文字色 #2A1B3D
            self.assertGreaterEqual(ratio("#2A1B3D", c), 4.5, c)

    def test_pr_table_nowrap_and_short_date(self):
        out = bp.render(model(), "x")
        self.assertIn("#prs td:nth-child(1),#prs td:nth-child(3),#prs td:nth-child(4){white-space:nowrap", out)  # PR 番号・担当者・日時は折り返さない
        a = out.index('id="prs"')
        self.assertRegex(out[a:], r'data-label="マージ日時">\d\d/\d\d \d\d:\d\d</td>')  # 11/07 17:52 の形
        self.assertNotRegex(out[a:], r'data-label="マージ日時">20\d\d-')

    def test_sort_buttons_for_narrow_width(self):
        out = bp.render(model(), "x")
        self.assertIn('class="sortbar"', out)
        self.assertIn('data-k="t" aria-pressed="true">マージ日時', out)
        self.assertIn('data-k="a" aria-pressed="false">担当者', out)
        self.assertIn("@media(max-width:700px){#prs .sortbar{display:flex}}", out)

    def test_header_short_and_overall_bar(self):
        out = bp.render(model(), "2026-11-05 07:30 JST", sample=True)
        head = out[out.index("<header"):out.index("</header>")]
        self.assertIn("更新 07:30", head)
        self.assertNotIn("数えるのは Issue だけ", head)
        self.assertNotIn("Issue の進み具合", head)  # 説明文は一番下の注記へ
        self.assertIn("ダミーデータの表示例", head)  # サンプルの札は --data のときだけ残る
        self.assertNotIn("ダミーデータの表示例", bp.render(model(), "x")[:3000])
        self.assertIn("全体 22% <span>（完了 2 / 9）</span>", out)
        self.assertNotIn('class="sum"', out)  # 数字タイルは無い
        self.assertNotIn(">未着手<", out.split("</header>")[1].split('id="al"')[0])
        tail = out.split('<p class="note">')[1]
        self.assertIn("自動で作られる。</p>", tail)  # 冒頭の1行は summary の外
        how = tail.split('<details class="howto">')[1].split("</details>")[0]
        self.assertIn("<summary>このページの見方</summary>", how)
        self.assertEqual(how.count("<li>"), 5)
        for lab in ("数えるもの", "状態", "分野の札", "期限", "更新"):
            self.assertIn(f"<b>{lab}:</b>", how)

    def test_click_shapes_links_underlined_status_borderless(self):
        out = bp.render(model(), "x")
        css = out.split("<style>")[1].split("</style>")[0]
        self.assertNotIn("text-decoration:none;overflow-wrap", css)  # 題名リンクは下線を消さない
        self.assertIn('.pg a[target="_blank"]::after', css)  # 外のサイトは ↗
        self.assertIn("\u2197", css)
        self.assertIn(".pg a:hover,.pg a:focus-visible{text-decoration-thickness:4px", css)
        self.assertIn(".pg details>summary{cursor:pointer;text-decoration:underline", css)  # 内訳を開く
        self.assertIn(".pg .st,.pg .sample{border:0;box-shadow:none}", css)  # 状態は枠なし
        for k in ("live", "plan", "try", "merged", "late", "soon", "set"):
            rule = [r for r in css.split("}") if f".pg .st.{k}" in r.split("{")[0] and "{" in r]
            self.assertTrue(rule, k)
            self.assertNotIn("border", rule[0])
            self.assertNotIn("var(--hero)", rule[0])  # 濃い塗り（ボタンの形）にしない

    def test_head_has_the_hub_icon_lines(self):
        hub = open(os.path.join(os.path.dirname(__file__), "..", "docs", "hub.html"), encoding="utf-8").read().split("\n")
        want = [l for l in hub if 'rel="icon"' in l or 'rel="apple-touch-icon"' in l]
        self.assertEqual(len(want), 4)
        head = bp.render(model(), "x").split("</head>")[0]
        for l in want:
            self.assertIn(l, head)  # hub.html の <head> と同じ4行（progress.html は docs/ と同じ階層）

    def test_now_section_contents_and_order(self):
        out = bp.render(model(), "x")
        al = out[out.index('id="al"'):out.index('class="pgrid"')]
        self.assertIn("⚠ ", al)
        self.assertIn("⏰ ", al)
        self.assertIn("👀 ", al)
        self.assertIn("PR #21", al)  # Ready の PR（Draft の #23 は出ない）
        self.assertNotIn("PR #23 ", al.split("👀")[1])
        self.assertIn('data-who="re-ji-tech0"', al)  # 作者で絞れる
        self.assertIn("レージ", al.split("👀")[1])  # 作者は表示名
        pos = [out.index(k) for k in ('id="al"', 'class="pgrid"', 'class="stg2"', 'id="prs"')]
        self.assertEqual(pos, sorted(pos))  # いま動くこと → 担当者カード → 段階 → 直近 PR
        self.assertTrue(out.index('id="al"') < out.index("全体 22%") + 400)

    def test_now_section_merged_but_open_and_empty(self):
        i = {"number": 1, "title": "t", "state": "open", "html_url": "https://github.com/a/b/issues/1",
             "milestone": None, "assignees": [{"login": "Hiroki0023"}]}
        p = {"number": 2, "title": "pr", "state": "closed", "html_url": "https://github.com/a/b/pull/2",
             "pull_request": {"merged_at": "2026-11-04T01:00:00Z"}, "body": "Closes #1", "user": {"login": "Hiroki0023"}}
        out = bp.render(bp.build_model([i, p], [], NAMES, dt.date(2026, 11, 5)), "x")
        self.assertIn("✅ ", out)
        self.assertIn("Issue を閉じるだけ", out)
        empty = bp.render(bp.build_model([{**i, "assignees": [], "state": "closed"}], [], NAMES, dt.date(2026, 11, 5)), "x")
        self.assertIn('<p class="none">いま急ぐものはありません 🎉</p>', empty)

    def test_empty_and_escape(self):
        self.assertIn("まだ Issue がありません", bp.render(model(data="progress-empty.json"), "x"))
        out = bp.render(bp.build_model(
            [{"number": 1, "title": "<script>x</script>", "state": "open", "html_url": "https://github.com/a/b/issues/1",
              "assignees": [], "milestone": None}], [], {}, dt.date(2026, 11, 5)), "x")
        self.assertNotIn("<script>x", out)


if __name__ == "__main__":
    unittest.main()
