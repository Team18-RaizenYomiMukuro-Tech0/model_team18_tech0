import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { candidatesUrl, SearchRunner, type SearchState } from "./api.ts";
import { searchMode } from "./searchMode.ts";
import { parseSearchQuery, searchHref, sortOptions } from "./searchQuery.ts";
import { clearConditions, toggleScene } from "./searchRequest.ts";

// #418 ADR-016 S-127 S-94 U-91: シーンの候補（R-01）を 12 件ずつ全件。ページ送り・並び替え（回数順を足す）は R-02 と同じ部品
const Q = (s = "") => parseSearchQuery(new URLSearchParams(s));

test("candidatesPage S-127: 要求に page・sort を付ける。1 ページ目・おすすめは付けない", () => {
  assert.equal(candidatesUrl({ scene: "送別", priceBand: null }), "/api/candidates?scene=%E9%80%81%E5%88%A5");
  assert.equal(candidatesUrl({ scene: "送別", priceBand: null, page: 1, sort: "recommend" }), "/api/candidates?scene=%E9%80%81%E5%88%A5");
  const u = candidatesUrl({ scene: "送別", priceBand: "3000to4999", page: 2, sort: "scene_count_desc" });
  assert.ok(u.includes("page=2") && u.includes("sort=scene_count_desc") && u.includes("price_band=3000to4999"));
});

test("candidatesPage S-127: searchMode はシーンあり（言葉なし）で page・sort つきの候補 API を呼ぶ", () => {
  const m = searchMode(Q("scene=送別&page=3&sort=scene_count_desc"));
  assert.equal(m.mode, "r01");
  assert.ok(m.url.startsWith("/api/candidates?") && m.url.includes("page=3") && m.url.includes("sort=scene_count_desc"));
});

test("candidatesPage S-127: 並びは 5 つ。回数順はシーンありの R-01 だけ（ラベルは「{シーン}で選ばれた回数順」）", () => {
  assert.deepEqual(sortOptions("送別").map((o) => o.label), ["おすすめ順", "安い順", "評価順", "早く届く順", "送別で選ばれた回数順"]);
  assert.equal(sortOptions(null).length, 4);
});

test("candidatesPage S-127 ⑥: URL の sort を読み、おすすめのときは付けない。シーンが無い・言葉があるとき（R-02）は回数順を既定に戻す", () => {
  assert.equal(Q("scene=送別&sort=scene_count_desc").sort, "scene_count_desc");
  assert.equal(searchHref(Q("scene=送別&sort=scene_count_desc")), "/search?scene=%E9%80%81%E5%88%A5&sort=scene_count_desc");
  assert.equal(searchHref(Q("scene=送別&sort=recommend")), "/search?scene=%E9%80%81%E5%88%A5");
  assert.equal(Q("sort=scene_count_desc").sort, "recommend");
  assert.equal(Q("scene=送別&q=ギフト&sort=scene_count_desc").sort, "recommend");
});

test("candidatesPage S-127: シーンを外す・条件を全部外すと、回数順は既定に戻る。ほかの並びは残る", () => {
  assert.equal(toggleScene(Q("scene=送別&sort=scene_count_desc&page=3"), "送別").sort, "recommend");
  assert.equal(toggleScene(Q("scene=送別&sort=scene_count_desc&page=3"), "送別").page, 1);
  assert.equal(toggleScene(Q("scene=送別&sort=price_asc"), "送別").sort, "price_asc");
  assert.equal(toggleScene(Q("scene=送別&sort=scene_count_desc"), "お礼").sort, "scene_count_desc");
  assert.equal(clearConditions(Q("scene=送別&sort=scene_count_desc")).sort, "recommend");
});

test("candidatesPage S-127 S-02: 応答の total・page・page_size を結果の状態に持つ（12 件・全 14 件）", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  const items = Array.from({ length: 12 }, (_, i) => ({ product_id: `G${i + 1}`, name: "商品", price: 1000, category: "食品", high_rating: false, reason: "理由" }));
  const states: SearchState[] = [];
  const r = new SearchRunner((s) => states.push(s), async () => ({ ok: true, json: async () => ({ items, count: 12, total: 14, page: 1, page_size: 12 }) }));
  r.run({ scene: "送別", priceBand: null });
  for (let i = 0; i < 8; i++) await Promise.resolve();
  const s = states[states.length - 1];
  assert.equal(s.status, "results");
  if (s.status === "results") assert.deepEqual([s.items.length, s.total, s.page, s.pageSize], [12, 14, 1, 12]);
  mock.timers.reset();
});
