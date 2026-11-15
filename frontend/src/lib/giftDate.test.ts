import assert from "node:assert/strict";
import { test } from "node:test";
import { giftVerdict } from "./giftDate.ts";

test("giftDate U-74: 届く日 11/17。贈る日 11/16 は間に合わない、11/17 と 11/18 は間に合う", () => {
  assert.equal(giftVerdict("2026-11-17", "2026-11-16"), "間に合わない（目安）");
  assert.equal(giftVerdict("2026-11-17", "2026-11-17"), "間に合う（目安）");
  assert.equal(giftVerdict("2026-11-17", "2026-11-18"), "間に合う（目安）");
});
test("giftDate U-74: 贈る日が空・形が違うときは何も出さない。配送日数なし（届く日なし）も出さない", () => {
  assert.equal(giftVerdict("2026-11-17", ""), null);
  assert.equal(giftVerdict("2026-11-17", "11/17"), null);
  assert.equal(giftVerdict(null, "2026-11-18"), null);
  assert.equal(giftVerdict(undefined, "2026-11-18"), null);
});
test("giftDate: 月・年をまたぐ日付も暦どおりに比べる", () => {
  assert.equal(giftVerdict("2027-01-02", "2026-12-31"), "間に合わない（目安）");
  assert.equal(giftVerdict("2026-12-02", "2027-01-01"), "間に合う（目安）");
});
