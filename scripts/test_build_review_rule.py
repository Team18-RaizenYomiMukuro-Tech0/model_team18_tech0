import importlib.util
import os
import re
import unittest

D = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("brr", os.path.join(D, "build-review-rule.py"))
brr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(brr)
MD = open(os.path.join(D, "..", brr.SRC), encoding="utf-8").read()
HTML = brr.build(MD, "o/r", "abcdef1234567")


class T(unittest.TestCase):
    def test_cards_for_sections_2_to_6(self):
        self.assertEqual(re.findall(r'<section class="rr-card[^"]*" id="s(\d)"', HTML), ["0", "2", "3", "4", "5", "6"])

    def test_aim_card_is_first_above_the_flow(self):
        self.assertLess(HTML.index('id="s0"'), HTML.index('id="s2"'))
        self.assertLess(HTML.index('id="s0"'), HTML.index('<ol class="rr-flow"'))
        self.assertIn("rr-aim", HTML.split('id="s0"')[0][-40:])
        s0 = HTML.split('id="s0"')[1].split('id="s2"')[0]
        self.assertEqual(s0.count("<li>"), 3)  # 狙い・目指す姿・守ること
        for w in ("承認待ちで作業が止まっていた", "人は判断が要る PR", "証拠がない PR は承認しない。迷ったら人に回す。"):
            self.assertIn(w, s0)

    def test_sections_1_to_6_unchanged_in_md(self):
        secs = brr.sections(MD)
        self.assertIn("扱うのはメンバー3人", secs[1][1])
        self.assertTrue(secs[2][0].startswith("自動レビューの流れ"))

    def test_label_table_rows_come_from_md(self):
        sec6 = brr.sections(MD)[6][1]
        rows = [l for l in sec6.splitlines() if l.startswith("|")][2:]  # 見出し行と区切り行を除く
        s6 = HTML.split('id="s6"')[1]
        self.assertEqual(s6.count("<tr>") - 1, len(rows))
        for l in rows:
            self.assertIn(re.findall(r"`([^`]+)`", l)[0], s6)  # 各ラベル名

    def test_numbered_and_bullet_lists_are_lists(self):
        s2 = HTML.split('id="s2"')[1].split('id="s3"')[0]
        self.assertEqual(s2.count("<li>") - 7, 5)  # 流れ図の li を除き、§2 の手順 5 つ
        self.assertEqual(HTML.split('id="s3"')[1].split('id="s4"')[0].count("<li>"), 5)  # §3 の条件 5 つ

    def test_flow_has_fixed_steps(self):
        for w in ("PR を作る", "AI レビュー", "ai-approved", "needs-human", "作成者以外が承認", "作成者がマージ"):
            self.assertIn(w, brr.FLOW)

    def test_footer_has_md_link_and_commit(self):
        self.assertIn('href="https://github.com/o/r/blob/abcdef1234567/', HTML)
        self.assertIn("<code>abcdef1</code>", HTML)

    def test_sentences_not_rewritten(self):
        self.assertIn("次のどれか1つでも当てはまれば、承認せずに", HTML)
        self.assertIn("Issue がない PR は Claude は承認しない", HTML)

    def test_flow_goes_stale_loudly(self):
        with self.assertRaises(SystemExit):
            brr.build(MD.replace("needs-human", "x-human"), "o/r", "abc")

    def test_hub_links_to_the_page_in_new_tab(self):
        hub = open(os.path.join(D, "..", "docs", "hub.html"), encoding="utf-8").read()
        m = re.search(r'<a ([^>]*)href="review-rule.html">(.*?)</a>', hub)
        self.assertIsNotNone(m)
        self.assertIn('target="_blank" rel="noopener"', m.group(1))
        self.assertIn("（別タブで開く）", m.group(2))
        self.assertLess(hub.index("レビュー待ちの PR"), hub.index("review-rule.html"))

    def test_source_md_untouched_by_build(self):
        before = open(os.path.join(D, "..", brr.SRC), "rb").read()
        brr.build(MD, "", "")
        self.assertEqual(before, open(os.path.join(D, "..", brr.SRC), "rb").read())


if __name__ == "__main__":
    unittest.main()
