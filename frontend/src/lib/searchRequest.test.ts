import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { REQUEST_TIMEOUT_MS, SearchRunner, type SearchState } from "./api.ts";
import type { Fetched, ProductList } from "./products.ts";
import { parseSearchQuery, searchHref } from "./searchQuery.ts";
import { clearConditions, hasConditions, ProductRunner, toggleCategory, togglePrice, toggleScene } from "./searchRequest.ts";

// S-22 S-23 S-55 S-57 S-58 I-34 I-35 E-15: 条件の操作と、続けて条件を変えたときの応答の取捨。偽のタイマーで応答を遅らせる
const Q = (s = "") => parseSearchQuery(new URLSearchParams(s));
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

test("searchRequest S-57 #46-1: シーン・価格帯は別のボタンで切り替わり、同じボタンの再押下で外れる。ページは1に戻る", () => {
  let q = toggleScene(Q("page=3"), "送別");
  assert.deepEqual([q.scene, q.page], ["送別", 1]);
  q = togglePrice(q, "3000to4999");
  assert.equal(q.priceBand, "3000to4999");
  q = toggleScene(q, "お礼");
  assert.equal(q.scene, "お礼");
  q = toggleScene(q, "お礼");
  assert.equal(q.scene, null);
  assert.equal(togglePrice(q, "3000to4999").priceBand, null);
});

test("searchRequest S-55 #58-5: カテゴリーは複数選べ、押すたびに選ぶ・外すが切り替わり、ほかは外さない", () => {
  let q = toggleCategory(Q(), "食品");
  q = toggleCategory(q, "コスメ");
  assert.deepEqual(q.categories, ["食品", "コスメ"]);
  q = toggleCategory(q, "食品");
  assert.deepEqual(q.categories, ["コスメ"]);
  assert.equal(searchHref(q), "/search?category=%E3%82%B3%E3%82%B9%E3%83%A1");
});

test("searchRequest S-58 #50-2 #55-3: 「条件をクリア」はシーン・価格帯・カテゴリーをすべて外す（商品の指定は触らない）", () => {
  const q = clearConditions(Q("scene=送別&price_band=under3000&category=食品&category=飲料&page=2&product=G0001"));
  assert.deepEqual([q.scene, q.priceBand, q.categories, q.page, q.product], [null, null, [], 1, "G0001"]);
  assert.equal(hasConditions(q), false);
  assert.equal(hasConditions(Q("category=食品")), true);
});

test("searchRequest S-66: クリアの直後にシーンなしで価格帯だけ押すと R-02 の URL になる", () => {
  const q = togglePrice(clearConditions(Q("scene=送別&price_band=under3000")), "3000to4999");
  assert.equal(searchHref(q), "/search?price_band=3000to4999");
});

// 偽の R-02: url ごとに delay 後に応答する。abort で失敗する
type R = { ok: boolean; status: number; json: () => Promise<unknown> };
function fakeFetch(delays: Record<string, number>, fail = false) {
  return (url: string | URL | Request, init?: RequestInit) =>
    new Promise<R>((resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      const u = String(url);
      setTimeout(() => resolve({ ok: !fail, status: fail ? 500 : 200, json: async () => ({ items: [{ product_id: u }], count: 1, total: 1, page: 1, page_size: 12 }) }), delays[u] ?? 0);
    }) as unknown as Promise<Response>;
}
const urlOf = (r: Fetched<ProductList> | null) => (r?.status === "ok" ? r.data.items[0].product_id : r?.status ?? "loading");

test("searchRequest I-34: 条件を続けて変えると、最後の条件の結果だけが残る。遅れて届いた古い応答は反映しない", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  const seen: string[] = [];
  const runner = new ProductRunner((_u, r) => seen.push(urlOf(r)), fakeFetch({ "/old": 5000, "/new": 100 }));
  runner.run("/old");
  runner.run("/new");
  mock.timers.tick(100);
  await flush();
  mock.timers.tick(10000);
  await flush();
  assert.equal(seen[seen.length - 1], "/new");
  assert.ok(!seen.includes("/old"));
  mock.timers.reset();
});

test("searchRequest I-35 E-15: R-02 は10秒で打ち切って失敗にし、再試行で復旧する", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  const seen: string[] = [];
  const delays: Record<string, number> = { "/slow": REQUEST_TIMEOUT_MS + 5000 };
  const runner = new ProductRunner((_u, r) => seen.push(urlOf(r)), fakeFetch(delays));
  runner.run("/slow");
  mock.timers.tick(REQUEST_TIMEOUT_MS - 1);
  await flush();
  assert.equal(seen[seen.length - 1], "loading");
  mock.timers.tick(1);
  await flush();
  assert.equal(seen[seen.length - 1], "error");
  delays["/slow"] = 10; // 再試行（同じ条件でもう一度）
  runner.run("/slow");
  mock.timers.tick(10);
  await flush();
  assert.equal(seen[seen.length - 1], "/slow");
  mock.timers.reset();
});

test("searchRequest E-15: R-02 の失敗（HTTP 500）は error", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  const seen: string[] = [];
  new ProductRunner((_u, r) => seen.push(urlOf(r)), fakeFetch({}, true)).run("/x");
  mock.timers.tick(0);
  await flush();
  assert.equal(seen[seen.length - 1], "error");
  mock.timers.reset();
});

test("searchRequest I-34: R-01 も同じ。シーンを続けて変えると、最後のシーンの結果だけ残る", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  const states: SearchState[] = [];
  const body = (n: string) => ({ items: [{ product_id: n, name: n, price: 1, category: "食品", high_rating: false, reason: "r" }], count: 1 });
  const runner = new SearchRunner(
    (s) => states.push(s),
    (url, init) =>
      new Promise((resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(new Error("aborted")));
        const late = url.includes(encodeURIComponent("お礼"));
        setTimeout(() => resolve({ ok: true, json: async () => body(late ? "OLD" : "NEW") }), late ? 5000 : 100);
      }),
  );
  runner.run({ scene: "お礼", priceBand: null });
  runner.run({ scene: "送別", priceBand: null });
  mock.timers.tick(100);
  await flush();
  mock.timers.tick(10000);
  await flush();
  const last = states[states.length - 1];
  assert.ok(last.status === "results" && last.items[0].product_id === "NEW");
  mock.timers.reset();
});
