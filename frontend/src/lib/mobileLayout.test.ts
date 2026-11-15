import test from "node:test";
import assert from "node:assert/strict";
import { cartBandText, conditionSummary, listBandText } from "./mobileLayout.ts";

const q = (o: Partial<Parameters<typeof conditionSummary>[0]> = {}) => ({ scene: null, priceBand: null, categories: [], ...o });

test("U-86: 条件が無いときは「条件を選ぶ ▼」", () => {
  assert.equal(conditionSummary(q()), "条件を選ぶ ▼");
});
test("U-86: シーン・価格・カテゴリーを「・」でつなぎ「▼ 絞り込み」", () => {
  assert.equal(conditionSummary(q({ scene: "お礼" })), "お礼 ▼ 絞り込み");
  assert.equal(conditionSummary(q({ scene: "お礼", priceBand: "under3000", categories: ["食品"] })), "お礼・〜2,999円・食品 ▼ 絞り込み");
});
test("U-86: カテゴリー 3 つはタイルの並び順（選んだ順にしない）", () => {
  const s = conditionSummary(q({ categories: ["家電", "食品", "生活雑貨"] }));
  const order = ["食品", "生活雑貨", "家電"].map((n) => s.indexOf(n));
  assert.ok(order[0] < order[1] && order[1] < order[2], s);
  assert.ok(s.endsWith("▼ 絞り込み"));
});
test("SP-29: 帯の左は R-01 で 1 件以上のときだけ", () => {
  assert.equal(listBandText(true, 0), null);
  assert.equal(listBandText(false, 3), null);
  assert.equal(listBandText(true, 3), "共有リスト 3件");
});
test("SP-29: 帯の右は「カート（N点）」（N は種類の数）", () => {
  assert.equal(cartBandText(0), "カート（0点）");
  assert.equal(cartBandText(2), "カート（2点）");
});
