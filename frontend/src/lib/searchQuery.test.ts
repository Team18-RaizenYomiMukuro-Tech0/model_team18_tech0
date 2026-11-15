import test from "node:test";
import assert from "node:assert/strict";
import { parseSearchQuery, searchHref } from "./searchQuery.ts";

// D-26 D-27 #85: /search の URL のクエリ
const P = (s: string) => parseSearchQuery(new URLSearchParams(s));

test("searchQuery #85: price_band・category（くり返し）・page・product を読む", () => {
  assert.deepEqual(P("price_band=3000to4999&category=食品&category=コスメ&page=2&product=G0007"), {
    scene: null, priceBand: "3000to4999", categories: ["食品", "コスメ"], page: 2, product: "G0007", sort: "recommend", q: "",
  });
});
test("searchQuery: 何も無ければ条件なし・1ページ目", () => {
  assert.deepEqual(P(""), { scene: null, priceBand: null, categories: [], page: 1, product: null, sort: "recommend", q: "" });
});
test("searchQuery: 範囲外のページ番号・形の違う値は無いものとして読む（範囲外のページは API が1ページ目を返す。#46-5）", () => {
  assert.equal(P("page=99").page, 99); // 範囲外かどうかは API が決める
  assert.equal(P("page=abc").page, 1);
  assert.equal(P("page=0").page, 1);
  assert.equal(P("page=1.5").page, 1);
  assert.equal(P("price_band=bad").priceBand, null);
  assert.deepEqual(P("category=食品&category=ない&category=食品").categories, ["食品"]);
  assert.equal(P("product=x").product, null); // D-29 の形（英大文字1字＋数字1〜9桁）に合わないものは「無い」
  assert.equal(P("product=").product, null);
  assert.equal(P("product=g0001").product, null);
  assert.equal(P("product=G0007").product, "G0007");
});
test("searchQuery: ページ送りの URL は同じ条件のまま page だけ替わる。1ページ目は page を付けない", () => {
  const s = P("price_band=3000to4999&category=食品");
  assert.equal(searchHref(s, { page: 2 }), "/search?price_band=3000to4999&category=%E9%A3%9F%E5%93%81&page=2");
  assert.equal(searchHref(s, { page: 1 }), "/search?price_band=3000to4999&category=%E9%A3%9F%E5%93%81");
  assert.equal(searchHref(P(""), { product: "G0005" }), "/search?product=G0005");
  assert.equal(searchHref(P("")), "/search");
});

// SP-21 D-43: sort は 4 つだけ。recommend（既定）は URL に付けない。4 つ以外は既定に戻す
test("searchQuery SP-21: sort を読む。4つ以外・空は recommend", () => {
  for (const v of ["price_asc", "rating_desc", "delivery_asc", "recommend"]) assert.equal(P(`sort=${v}`).sort, v);
  assert.equal(P("sort=bad").sort, "recommend");
  assert.equal(P("sort=").sort, "recommend");
  assert.equal(P("").sort, "recommend");
});
test("searchQuery SP-21: URL の sort。recommend のときは付けず、並びを選ぶとほかの条件はそのまま", () => {
  const s = P("price_band=3000to4999&sort=price_asc");
  assert.equal(searchHref(s), "/search?price_band=3000to4999&sort=price_asc");
  assert.equal(searchHref(s, { sort: "recommend" }), "/search?price_band=3000to4999");
  assert.equal(searchHref(P("sort=delivery_asc&page=2")), "/search?sort=delivery_asc&page=2");
});

// D-49 SP-35 U: 言葉（q）。前後の空白は除く・50 文字まで・URL に出す・条件は残す
test("searchQuery D-49: q を読む（前後の空白を除く。空白だけは言葉なし。51 文字目は切る）", () => {
  assert.equal(P("q=%E3%82%AE%E3%83%95%E3%83%88").q, "ギフト");
  assert.equal(P("q=%20%E7%94%98%E3%81%84%E3%82%82%E3%81%AE%20").q, "甘いもの");
  assert.equal(P("q=%20%20").q, "");
  assert.equal(Array.from(P(`q=${"あ".repeat(51)}`).q).length, 50);
});
test("searchQuery D-49: searchHref は q を付け、シーン・価格帯・カテゴリーを残す。q が空なら付けない", () => {
  const s = P("scene=%E3%81%8A%E7%A4%BC&price_band=under3000&category=%E9%A3%9F%E5%93%81&page=3");
  assert.equal(searchHref(s, { q: "甘いもの", page: 1 }), "/search?scene=%E3%81%8A%E7%A4%BC&price_band=under3000&category=%E9%A3%9F%E5%93%81&q=%E7%94%98%E3%81%84%E3%82%82%E3%81%AE");
  assert.equal(searchHref(P("q=%E7%94%98"), { q: "" }), "/search");
});
