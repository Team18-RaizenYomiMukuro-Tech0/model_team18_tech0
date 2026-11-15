import assert from "node:assert/strict";
import { test } from "node:test";
import { VOICES_HEADING, voiceViews } from "./voices.ts";

test("voices S-75: 本文は「」で囲み、星は「★5」。名前・ID・日付は出さない（持たない）", () => {
  assert.equal(VOICES_HEADING, "贈った人の声");
  assert.deepEqual(voiceViews([{ text: "よかった", rating: 5 }]), [{ quote: "「よかった」", stars: "★5" }]);
});
test("voices SP-17: 最大 2 件。長い文は切らない。空白だけの文は出さない", () => {
  const long = "あ".repeat(100);
  const v = voiceViews([{ text: long, rating: 4 }, { text: "   ", rating: 5 }, { text: "b", rating: 5 }, { text: "c", rating: 5 }]);
  assert.equal(v.length, 2);
  assert.equal(v[0]!.quote, `「${long}」`);
  assert.equal(v[1]!.quote, "「b」");
});
test("voices S-75 ②: 0 件・読めなかった（null）は空（欄ごと出さない）", () => {
  assert.deepEqual(voiceViews([]), []);
  assert.deepEqual(voiceViews(null), []);
});
