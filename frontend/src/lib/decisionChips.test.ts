import assert from "node:assert/strict";
import { test } from "node:test";
import { decisionChips } from "./decisionChips.ts";

test("decisionChips S-74: 並びは 届く日 → ラッピング可 → 在庫あり → {シーン}で{n}回", () => {
  const c = decisionChips({ arrivesOn: "2026-11-18", wrapping: true, inStock: true, sceneCount: { scene: "送別", n: 12 } });
  assert.deepEqual(c.map((x) => x.text), ["11/18までに届く（目安）", "ラッピング可", "在庫あり", "送別で12回"]);
  assert.deepEqual(c.map((x) => x.icon), ["box", "ribbon", null, null]);
});
test("decisionChips SP-16: 値の無い決め手は出さない（null・false・0・無し）。値を作らない", () => {
  assert.deepEqual(decisionChips({}), []);
  assert.deepEqual(decisionChips({ arrivesOn: null, wrapping: false, inStock: false, sceneCount: { scene: "お礼", n: 0 } }), []);
  assert.deepEqual(decisionChips({ arrivesOn: "bad", wrapping: null }), []);
});
test("decisionChips S-74: シーンを選んでいない画面（sceneCount が無い）では回数を出さない。R-02 のカードは 3 つまで", () => {
  const c = decisionChips({ arrivesOn: "2026-11-18", wrapping: true, inStock: true });
  assert.deepEqual(c.map((x) => x.key), ["arrives", "wrap", "stock"]);
});
test("decisionChips SP-16: 在庫 0（詳細の status が out_of_stock）は「在庫あり」を出さない", () => {
  assert.deepEqual(decisionChips({ inStock: false, wrapping: true }).map((x) => x.key), ["wrap"]);
});
test("decisionChips S-83: 誕生日・お礼の回数も同じ形", () => {
  assert.deepEqual(decisionChips({ sceneCount: { scene: "誕生日", n: 3 } }).map((x) => x.text), ["誕生日で3回"]);
});
