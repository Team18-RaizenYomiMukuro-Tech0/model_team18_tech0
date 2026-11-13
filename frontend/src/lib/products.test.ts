import test from "node:test";
import assert from "node:assert/strict";
import { emptyMessageR02, fetchJson, isProductList, productsUrl, ratingText } from "./products.ts";

// D-28 SP-11 S-27 #55-2 #56-4: 取得の URL・0件の文言・評価の表示
test("products: 条件なしは /api/products。条件は D-28 と同じ名前で付く。budget は付けない", () => {
  assert.equal(productsUrl({ priceBand: null, categories: [], page: 1 }), "/api/products");
  const u = productsUrl({ priceBand: "3000to4999", categories: ["食品", "コスメ"], page: 2 });
  assert.equal(u, "/api/products?price_band=3000to4999&category=%E9%A3%9F%E5%93%81&category=%E3%82%B3%E3%82%B9%E3%83%A1&page=2");
  assert.ok(!u.includes("budget"));
});
test("products: 0件の文言の優先はカテゴリー→価格帯→シーン", () => {
  assert.equal(emptyMessageR02({ priceBand: "under3000", categories: ["食品"] }), "この条件に合う商品がありません。カテゴリーを変えてみてください");
  assert.equal(emptyMessageR02({ priceBand: "under3000", categories: [] }), "条件に合う商品がありません。価格帯を変えてみてください");
  assert.equal(emptyMessageR02({ priceBand: null, categories: [] }), "この条件に合う商品がありません。シーンを変えてみてください");
});
test("products S-27: 評価はデータの値のまま。丸めない", () => {
  assert.equal(ratingText(4.49), "4.49");
  assert.equal(ratingText(4.5), "4.5");
  assert.equal(ratingText(4.7), "4.7");
  assert.equal(ratingText(4), "4.0");
});
test("products: 取得は 404 → notfound、HTTP 失敗・通信失敗・形の違う応答 → error、成功 → ok", async () => {
  const r = (status: number, body: unknown) => async () => ({ status, ok: status < 400, json: async () => body }) as unknown as Response;
  const good = { items: [], count: 0, total: 0, page: 1, page_size: 12 };
  assert.equal((await fetchJson("/x", isProductList, undefined, r(200, good))).status, "ok");
  assert.equal((await fetchJson("/x", isProductList, undefined, r(404, {}))).status, "notfound");
  assert.equal((await fetchJson("/x", isProductList, undefined, r(500, {}))).status, "error");
  assert.equal((await fetchJson("/x", isProductList, undefined, r(200, { nope: 1 }))).status, "error");
  assert.equal((await fetchJson("/x", isProductList, undefined, async () => { throw new Error("net"); })).status, "error");
});
