import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyMessageR02, fetchJson, fetchSimilar, fetchVoices, isProductList, productUrl, productsUrl, ratingText, similarUrl, voicesUrl,
} from "./products.ts";

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

// D-43 SP-21: sort は recommend（既定）のとき付けない。ほかの条件と同じ名前（page の前）
test("products D-43: productsUrl の sort。recommend・未指定は付けない。1ページ目に戻る", () => {
  assert.equal(productsUrl({ priceBand: null, categories: [], page: 1, sort: "recommend" }), "/api/products");
  assert.equal(productsUrl({ priceBand: null, categories: [], page: 1, sort: "price_asc" }), "/api/products?sort=price_asc");
  assert.equal(
    productsUrl({ priceBand: "under3000", categories: ["食品"], page: 2, sort: "delivery_asc" }),
    "/api/products?price_band=under3000&category=%E9%A3%9F%E5%93%81&sort=delivery_asc&page=2",
  );
});
// D-29: 詳細の scene は R-01 から開いたときだけ
test("products D-29: productUrl の scene は付けたときだけ", () => {
  assert.equal(productUrl("G0001"), "/api/products/G0001");
  assert.equal(productUrl("G0001", null), "/api/products/G0001");
  assert.equal(productUrl("G0001", "お礼"), "/api/products/G0001?scene=%E3%81%8A%E7%A4%BC");
});
test("products D-35 D-42: 声と似た商品の URL", () => {
  assert.equal(voicesUrl("G0001"), "/api/products/G0001/voices");
  assert.equal(similarUrl("G0001", "送別"), "/api/products/G0001/similar?scene=%E9%80%81%E5%88%A5");
});
test("products D-35: 声は 0〜2 件の {text, rating}。形の違う応答・失敗は error", async () => {
  const r = (status: number, body: unknown) => async () => ({ status, ok: status < 400, json: async () => body }) as unknown as Response;
  const ok = await fetchVoices("G0001", undefined, r(200, { voices: [{ text: "よかった", rating: 5 }] }));
  assert.deepEqual(ok, { status: "ok", data: { voices: [{ text: "よかった", rating: 5 }] } });
  assert.equal((await fetchVoices("G0001", undefined, r(200, { voices: [] }))).status, "ok");
  assert.equal((await fetchVoices("G0001", undefined, r(200, { voices: [{ text: 1 }] }))).status, "error");
  assert.equal((await fetchVoices("G0001", undefined, r(500, {}))).status, "error");
  assert.equal((await fetchVoices("G0001", undefined, r(422, {}))).status, "error");
});
test("products D-42: 似た商品は {items}。404 は notfound", async () => {
  const r = (status: number, body: unknown) => async () => ({ status, ok: status < 400, json: async () => body }) as unknown as Response;
  assert.equal((await fetchSimilar("G0001", "お礼", undefined, r(200, { items: [] }))).status, "ok");
  assert.equal((await fetchSimilar("G0001", "お礼", undefined, r(404, {}))).status, "notfound");
  assert.equal((await fetchSimilar("G0001", "お礼", undefined, r(200, { nope: 1 }))).status, "error");
});
// D-34 D-44: 第2弾の項目は省略できる（D2 が入るまでは来ない）が、来れば読める
test("products D-34 D-44: arrives_on・scene_count・relax は来れば型どおりに読める", () => {
  const body = {
    items: [{ product_id: "G0001", name: "a", price: 1, category: "食品", rating: null, review_count: null, delivery_days: 3, wrapping: true, high_rating: false, arrives_on: "2026-11-18", scene_count: { scene: "送別", n: 12 } }],
    count: 1, total: 0, page: 1, page_size: 12, relax: { price_band: 609, category: null },
  };
  assert.ok(isProductList(body));
  assert.equal(body.items[0]!.arrives_on, "2026-11-18");
  assert.equal(body.items[0]!.scene_count?.n, 12);
});
