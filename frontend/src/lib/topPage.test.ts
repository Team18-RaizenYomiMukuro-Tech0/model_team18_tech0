import test from "node:test";
import assert from "node:assert/strict";
import { RECOMMEND_COUNT, bandLinkHref, buildSearchHref, categoryToggle, fetchRecommended, onBandPress, pickRecommended, type RecommendedItem } from "./topPage.ts";

// U-45 U-46 S-52〜S-56 D-26: タイルと価格帯ボタンの押し方から、検索結果へ渡す条件が組み立てられる
test("topPage U-45: シーンのタイルだけ → シーンだけ。価格帯を先に選んでいれば価格帯つき", () => {
  assert.equal(buildSearchHref({ scene: "送別" }), "/search?scene=%E9%80%81%E5%88%A5");
  assert.equal(
    buildSearchHref({ scene: "送別", priceBand: "3000to4999" }),
    "/search?scene=%E9%80%81%E5%88%A5&price_band=3000to4999",
  );
});
test("topPage U-45: シーン未選択の価格帯だけは移らない。シーンを選んでいれば移る（#51-1）", () => {
  assert.equal(onBandPress(null, "3000to4999").navigateTo, null);
  assert.ok(onBandPress("送別", "3000to4999").navigateTo?.includes("price_band=3000to4999"));
});
test("topPage U-45: 「この価格帯の商品を見る」は、シーン未選択で価格帯ありのときだけ（#53-3、#54-8）", () => {
  assert.equal(bandLinkHref(null, "under3000"), "/search?price_band=under3000");
  assert.equal(bandLinkHref(null, null), null); // 価格帯を外したとき
  assert.equal(bandLinkHref("送別", "under3000"), null); // シーンも選んでいるとき
});
test("topPage U-45: カテゴリーのタイル → そのカテゴリー1つだけ。おすすめ → 商品を指定", () => {
  assert.equal(buildSearchHref({ category: "食品" }), "/search?category=%E9%A3%9F%E5%93%81");
  assert.equal(buildSearchHref({ productId: "G0007" }), "/search?product=G0007");
});
test("topPage U-46: 開閉ボタンの aria-expanded は、閉じていれば false、開けば true。印は ▼ から ▲", () => {
  assert.deepEqual(categoryToggle(false), { expanded: false, mark: "▼" });
  assert.deepEqual(categoryToggle(true), { expanded: true, mark: "▲" });
});
test("topPage U-45: おすすめは先頭4件", () => {
  const items: RecommendedItem[] = Array.from({ length: 12 }, (_, i) => ({
    product_id: `G${String(i + 1).padStart(4, "0")}`, name: `商品${i + 1}`, price: 1000, category: "食品", rating: null, review_count: null, high_rating: false,
  }));
  assert.equal(RECOMMEND_COUNT, 4);
  assert.deepEqual(pickRecommended(items).map((x) => x.product_id), ["G0001", "G0002", "G0003", "G0004"]);
  assert.equal(pickRecommended(items.slice(0, 2)).length, 2);
});

// キックオフ記録 #86: おすすめの取得が失敗したら error（見出しの下に「読み込めませんでした」と「もう一度」）。もう一度で復旧できる
const res = (ok: boolean, body: unknown) => ({ ok, json: async () => body }) as unknown as Response;
test("topPage #86: おすすめの取得 通信の失敗・HTTP の失敗・形の違う応答は error", async () => {
  assert.deepEqual(await fetchRecommended(async () => { throw new Error("network"); }), { status: "error" });
  assert.deepEqual(await fetchRecommended(async () => res(false, {})), { status: "error" });
  assert.deepEqual(await fetchRecommended(async () => res(true, { nothing: 1 })), { status: "error" });
});
test("topPage #86: おすすめの取得 成功は先頭4件。もう一度（再取得）で復旧する", async () => {
  const body = { items: Array.from({ length: 12 }, (_, i) => ({ product_id: `G${String(i + 1).padStart(4, "0")}`, name: "x", price: 1, category: "食品", rating: null, review_count: null, high_rating: false })) };
  let fail = true;
  const f = async () => (fail ? res(false, {}) : res(true, body));
  assert.equal((await fetchRecommended(f)).status, "error");
  fail = false; // 復旧して「もう一度」
  const r = await fetchRecommended(f);
  assert.equal(r.status, "ok");
  assert.equal(r.status === "ok" && r.items.length, 4);
});
