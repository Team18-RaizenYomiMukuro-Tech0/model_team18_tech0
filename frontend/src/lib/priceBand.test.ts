import test from "node:test";
import assert from "node:assert/strict";
import { PRICE_BANDS, togglePriceBand, type PriceBand } from "./priceBand.ts";

// U-20 相当（#49-7 で旧 U-20 は削除済み。テスト設計の ID は更新後に付ける） SP-01 #49-1〜3
test("priceBand: 初期は未選択。1つ選ぶとそのボタンだけが選択される", () => {
  let sel: PriceBand | null = null;
  assert.equal(sel, null);
  sel = togglePriceBand(sel, "under3000");
  assert.equal(sel, "under3000");
});
test("priceBand: 別のボタンを押すと切り替わる", () => {
  assert.equal(togglePriceBand("under3000", "3000to4999"), "3000to4999");
  assert.equal(togglePriceBand("3000to4999", "5000plus"), "5000plus");
});
test("priceBand: 同じボタンをもう一度押すと未選択に戻る", () => {
  assert.equal(togglePriceBand("5000plus", "5000plus"), null);
});
test("priceBand: 選べる値は3つだけで API の price_band と同じ。文字は「3,000〜4,999円」", () => {
  assert.deepEqual(PRICE_BANDS.map((b) => b.value), ["under3000", "3000to4999", "5000plus"]);
  assert.deepEqual(PRICE_BANDS.map((b) => b.label), ["〜2,999円", "3,000〜4,999円", "5,000円〜"]);
});
