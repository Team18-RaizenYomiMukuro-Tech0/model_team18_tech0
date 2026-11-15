import test from "node:test";
import assert from "node:assert/strict";
import { relaxRows } from "./relaxHelp.ts";
import type { SearchQuery } from "./searchQuery.ts";

const q = (o: Partial<SearchQuery> = {}): SearchQuery => ({ scene: null, priceBand: "under3000", categories: ["食品"], page: 2, product: null, sort: "recommend", q: "", ...o });

test("U-77: 価格帯とカテゴリーを選んでいて件数があれば、この順に 2 行", () => {
  const rows = relaxRows(q(), { price_band: 609, category: 1199 });
  assert.deepEqual(rows.map((r) => r.text), ["価格帯をはずすと 609 件", "カテゴリーをはずすと 1199 件"]);
});
test("U-77: 件数 0 の行は出さない", () => {
  assert.deepEqual(relaxRows(q(), { price_band: 0, category: 5 }).map((r) => r.text), ["カテゴリーをはずすと 5 件"]);
});
test("U-77: 選んでいない条件の行は出さない（価格帯だけ選んでいるとき）", () => {
  const rows = relaxRows(q({ categories: [] }), { price_band: 7, category: 5 });
  assert.deepEqual(rows.map((r) => r.text), ["価格帯をはずすと 7 件"]);
  assert.deepEqual(relaxRows(q({ categories: [] }), { price_band: null, category: 5 }), []);
});
test("U-77: relax が無い（取れなかった）ときは助け舟を出さない", () => {
  assert.deepEqual(relaxRows(q(), undefined), []);
  assert.deepEqual(relaxRows(q(), null), []);
});
test("SP-24: 押すとその条件だけはずした条件になり、ページは 1 に戻る（シーン・並びはそのまま）", () => {
  const rows = relaxRows(q({ scene: "お礼", sort: "price_asc" }), { price_band: 3, category: 4 });
  assert.deepEqual({ ...rows[0].next }, { scene: "お礼", priceBand: null, categories: ["食品"], page: 1, product: null, sort: "price_asc", q: "" });
  assert.deepEqual({ ...rows[1].next }, { scene: "お礼", priceBand: "under3000", categories: [], page: 1, product: null, sort: "price_asc", q: "" });
});

// D-49 SP-35 ⑥: 言葉をはずすと n 件（relax.no_q）。言葉があるときだけ・n が 0 や無いときは出さない。押すと言葉だけ外れる
test("relaxHelp SP-35: 言葉をはずすと n 件は、価格帯・カテゴリーの行の後に 1 行。押すと q だけ外れる", () => {
  const rows = relaxRows(q({ q: "甘いもの" }), { price_band: 3, category: 4, no_q: 40 });
  assert.deepEqual(rows.map((r) => r.text), ["価格帯をはずすと 3 件", "カテゴリーをはずすと 4 件", "言葉をはずすと 40 件"]);
  assert.deepEqual({ ...rows[2].next }, { scene: null, priceBand: "under3000", categories: ["食品"], page: 1, product: null, sort: "recommend", q: "" });
  assert.deepEqual(relaxRows(q({ q: "zzz", priceBand: null, categories: [] }), { price_band: null, category: null, no_q: 7 }).map((r) => r.text), ["言葉をはずすと 7 件"]);
  assert.deepEqual(relaxRows(q({ q: "zzz" }), { price_band: null, category: null, no_q: 0 }), []);
  assert.deepEqual(relaxRows(q(), { price_band: null, category: null, no_q: 9 }), []); // 言葉が無ければ出さない
});
