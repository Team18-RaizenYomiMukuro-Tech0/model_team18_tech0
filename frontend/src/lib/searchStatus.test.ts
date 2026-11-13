import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { candidatesUrl, REQUEST_TIMEOUT_MS, SearchRunner, type SearchState } from "./api.ts";

// E-01 E-02 E-03 E-12 AC-11: 偽のタイマーで API の応答を遅らせる／失敗させる
type Res = { ok: boolean; json: () => Promise<unknown> };
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};
const OK = { items: [{ product_id: "G0001", name: "テスト商品", price: 4000, category: "食品", high_rating: true, reason: "理由" }], count: 1 };
const last = (s: SearchState[]) => s[s.length - 1].status;

// 偽の fetch: delay ミリ秒後に応答する。signal が中止されたら失敗する
function delayed(delay: number, body: unknown, ok: boolean, init: { signal: AbortSignal }) {
  return new Promise<Res>((resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(new Error("aborted")));
    setTimeout(() => resolve({ ok, json: async () => body }), delay);
  });
}
function setup(delay: number, body: unknown = OK, ok = true) {
  mock.timers.enable({ apis: ["setTimeout"] });
  const states: SearchState[] = [];
  const runner = new SearchRunner((s) => states.push(s), (_url, init) => delayed(delay, body, ok, init));
  return { runner, states };
}

test("searchStatus E-01: 9秒で返る応答は「検索中」から結果に変わる", async () => {
  const { runner, states } = setup(9000);
  runner.run({ scene: "送別", priceBand: null });
  assert.equal(last(states), "loading");
  mock.timers.tick(8999);
  await flush();
  assert.equal(last(states), "loading");
  mock.timers.tick(1);
  await flush();
  assert.equal(last(states), "results");
  mock.timers.reset();
});

test("searchStatus E-02: 11秒返らない場合は10秒で失敗になる（通信を中止）", async () => {
  const { runner, states } = setup(11000);
  runner.run({ scene: "送別", priceBand: null });
  mock.timers.tick(REQUEST_TIMEOUT_MS - 1);
  await flush();
  assert.equal(last(states), "loading");
  mock.timers.tick(1);
  await flush();
  assert.equal(last(states), "error");
  mock.timers.reset();
});

test("searchStatus E-02: API が失敗（500）したらすぐ失敗表示", async () => {
  const { runner, states } = setup(100, {}, false);
  runner.run({ scene: "送別", priceBand: null });
  mock.timers.tick(100);
  await flush();
  assert.equal(last(states), "error");
  mock.timers.reset();
});

test("searchStatus E-03: 失敗のあとに復旧して再試行すると結果が出て、失敗表示が消える", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  const states: SearchState[] = [];
  let delay = 11000;
  const runner = new SearchRunner((s) => states.push(s), (_url, init) => delayed(delay, OK, true, init));
  runner.run({ scene: "送別", priceBand: null });
  mock.timers.tick(10000);
  await flush();
  assert.equal(last(states), "error");
  delay = 500; // 復旧
  runner.run({ scene: "送別", priceBand: null }); // 再試行ボタン
  assert.equal(last(states), "loading"); // 失敗表示は消える
  mock.timers.tick(500);
  await flush();
  assert.equal(last(states), "results");
  mock.timers.reset();
});

test("searchStatus E-12: 10秒で失敗を出したあと、12秒目に届いた応答は画面に出ない", async () => {
  const { runner, states } = setup(12000);
  runner.run({ scene: "送別", priceBand: null });
  mock.timers.tick(10000);
  await flush();
  assert.equal(last(states), "error");
  const n = states.length;
  mock.timers.tick(2000);
  await flush();
  assert.equal(states.length, n); // 何も増えない
  assert.equal(last(states), "error");
  mock.timers.reset();
});

test("searchStatus AC-11: 続けて操作したら最新の結果だけを残し、古い応答は捨てる", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  const states: SearchState[] = [];
  let n = 0;
  const runner = new SearchRunner((s) => states.push(s), (_url, init) => {
    n++;
    return n === 1 ? delayed(5000, { items: [], count: 0 }, true, init) : delayed(1000, OK, true, init);
  });
  runner.run({ scene: "送別", priceBand: null });
  runner.run({ scene: "送別", priceBand: "3000to4999" });
  mock.timers.tick(5000);
  await flush();
  assert.equal(last(states), "results"); // 古い（0件）の応答で上書きされない
  mock.timers.reset();
});

test("searchStatus 0件: items が空なら empty", async () => {
  const { runner, states } = setup(10, { items: [], count: 0 });
  runner.run({ scene: "誕生日", priceBand: "under3000" });
  mock.timers.tick(10);
  await flush();
  assert.equal(last(states), "empty");
  mock.timers.reset();
});

test("searchStatus 要求の中身: 価格帯なしは price_band を付けない。ありは付ける（#51-2）", () => {
  const none = candidatesUrl({ scene: "送別", priceBand: null });
  assert.ok(!none.includes("price_band"));
  assert.ok(none.startsWith("/api/candidates?scene="));
  assert.ok(candidatesUrl({ scene: "送別", priceBand: "3000to4999" }).endsWith("&price_band=3000to4999"));
});
