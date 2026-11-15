import assert from "node:assert/strict";
import { test } from "node:test";
import { pageItems, prevNext, type PageItem } from "./pagination.ts";

const T = 223 * 12; // 全 223 ページ
const show = (a: PageItem[], page: number) => a.map((x) => (x === "gap" ? "…" : x === page ? `[${x}]` : String(x))).join(" ");

test("pageItems U-72: 全 223 ページの 6 ページ目は 1 … 4 5 [6] 7 8 … 223", () => {
  assert.equal(show(pageItems(T, 6), 6), "1 … 4 5 [6] 7 8 … 223");
});
test("pageItems U-72: 1・2 ページ目と 222・223 ページ目", () => {
  assert.equal(show(pageItems(T, 1), 1), "[1] 2 3 … 223");
  assert.equal(show(pageItems(T, 2), 2), "1 [2] 3 4 … 223");
  assert.equal(show(pageItems(T, 222), 222), "1 … 220 221 [222] 223");
  assert.equal(show(pageItems(T, 223), 223), "1 … 221 222 [223]");
});
test("pageItems U-72: 4 ページ目は最初の「…」が入らない（間が空かない）。5 ページ目は入る", () => {
  assert.equal(show(pageItems(T, 4), 4), "1 2 3 [4] 5 6 … 223");
  assert.equal(show(pageItems(T, 5), 5), "1 … 3 4 [5] 6 7 … 223");
});
test("pageItems U-72: 全 7 ページ以下は全部出す。1 ページだけなら番号は 1 つ。0 件は空", () => {
  assert.deepEqual(pageItems(7 * 12, 4), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(pageItems(8 * 12, 1).includes("gap"), true);
  assert.deepEqual(pageItems(5, 1), [1]);
  assert.deepEqual(pageItems(0, 1), []);
});
test("pageItems U-72: 「前へ」は 1 ページ目で、「次へ」は最後のページで押せない。1 ページだけならどちらも押せない", () => {
  assert.deepEqual(prevNext(T, 1), { prev: null, next: 2 });
  assert.deepEqual(prevNext(T, 223), { prev: 222, next: null });
  assert.deepEqual(prevNext(5, 1), { prev: null, next: null });
});
