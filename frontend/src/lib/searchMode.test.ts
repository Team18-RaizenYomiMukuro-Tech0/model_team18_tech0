import test from "node:test";
import assert from "node:assert/strict";
import { categoryNote, searchMode } from "./searchMode.ts";
import { parseSearchQuery } from "./searchQuery.ts";

// U-47 F-19 D-27 #51-2 #55-1: シーンがあれば /api/candidates、無ければ /api/products。budget は送らない
const M = (s: string) => searchMode(parseSearchQuery(new URLSearchParams(s)));

test("searchMode: シーンがあれば /api/candidates（価格帯があれば price_band を付ける）", () => {
  assert.deepEqual(M("scene=送別"), { mode: "r01", url: "/api/candidates?scene=%E9%80%81%E5%88%A5" });
  assert.equal(M("scene=送別&price_band=3000to4999").url, "/api/candidates?scene=%E9%80%81%E5%88%A5&price_band=3000to4999");
});

test("searchMode: カテゴリーも選んでいれば、選んだ数だけ category をくり返して付ける", () => {
  const u = new URL(M("scene=送別&category=食品&category=コスメ").url, "http://x");
  assert.equal(u.pathname, "/api/candidates");
  assert.deepEqual(u.searchParams.getAll("category"), ["食品", "コスメ"]);
});

test("searchMode: シーンが無ければ /api/products（価格帯・カテゴリーがあっても無くても）", () => {
  assert.equal(M("").mode, "r02");
  assert.equal(M("").url, "/api/products");
  assert.equal(M("price_band=3000to4999").url, "/api/products?price_band=3000to4999");
  const u = new URL(M("category=食品&category=飲料").url, "http://x");
  assert.equal(u.pathname, "/api/products");
  assert.deepEqual(u.searchParams.getAll("category"), ["食品", "飲料"]);
});

test("searchMode: どちらの API にも budget を送らない。形の違うシーンは無いものとして R-02", () => {
  for (const s of ["scene=送別&price_band=under3000&category=食品", "price_band=5000plus&category=食品", "scene=でたらめ"]) {
    assert.ok(!M(s).url.includes("budget"), s);
  }
  assert.equal(M("scene=でたらめ").mode, "r02");
});

test("categoryNote #58-7: 選んだカテゴリーを「・」でつないで全部出す。並びはタイルの並び順（選んだ順にしない）", () => {
  assert.equal(categoryNote(["コスメ", "食品"]), "食品・コスメ");
  assert.equal(categoryNote(["カタログギフト", "生活雑貨", "酒類"]), "生活雑貨・酒類・カタログギフト");
  assert.equal(categoryNote([]), "");
});
