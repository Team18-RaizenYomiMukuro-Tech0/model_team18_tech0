import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { SearchRunner, ShareLinkRunner } from "./api.ts";
import { ProductRunner } from "./searchRequest.ts";
import { entryOf, trackFirstLoad, zeroCondOf, TEST_KEY_STORE, type EventExtra, type EventStep, type StorageLike } from "./tracking.ts";
import { createCartStore } from "../state/cart.ts";

// S-101〜S-104・S-116（画面側の呼び出し点 D7）: 送る関数を偽物にして、①②④⑤⑦ が決まった時にだけ・決まった値で呼ばれることを確かめる
type Call = [EventStep, EventExtra | undefined];
const recorder = () => {
  const calls: Call[] = [];
  return { calls, tracker: (step: EventStep, extra?: EventExtra) => void calls.push([step, extra]) };
};
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
const mem = (): StorageLike & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
};
const okJson = (body: unknown) => async () => ({ ok: true, json: async () => body });

test("① entryOf: 最初に開いたページの種類（トップ・検索・詳細・共有・その他）", () => {
  assert.equal(entryOf("/", ""), "top");
  assert.equal(entryOf("/search", "?scene=お礼"), "search");
  assert.equal(entryOf("/search", ""), "search");
  assert.equal(entryOf("/search", "?product=G0007"), "detail");
  assert.equal(entryOf("/search", "?product=bad"), "search"); // 形の違う商品 ID は詳細ではない
  assert.equal(entryOf("/s/abcDEF123", ""), "share");
  assert.equal(entryOf("/nowhere", ""), "other");
});

test("⑦ zeroCondOf: 価格帯だけ・カテゴリーだけ・両方・シーンだけ。条件なしは記録しない", () => {
  assert.equal(zeroCondOf({ scene: true, priceBand: true, categories: false }), "price");
  assert.equal(zeroCondOf({ scene: false, priceBand: false, categories: true }), "category");
  assert.equal(zeroCondOf({ scene: true, priceBand: true, categories: true }), "both");
  assert.equal(zeroCondOf({ scene: true, priceBand: false, categories: false }), "scene_only");
  assert.equal(zeroCondOf({ scene: false, priceBand: false, categories: false }), null);
});

test("① trackFirstLoad: 段1を entry つきで送る。giftia_test は取り込んで URL から取り除き、送る本文に test_key で入る（K-5）", () => {
  const sent: Record<string, unknown>[] = [];
  const local = mem();
  const session = mem();
  const r = trackFirstLoad({ pathname: "/search", search: "?scene=お礼&giftia_test=dummy-key" }, { local, session, now: 1, send: (b) => sent.push(b) });
  assert.equal(r.cleaned, "?scene=%E3%81%8A%E7%A4%BC"); // 目印は URL から消える
  assert.equal(session.data.get(TEST_KEY_STORE), "dummy-key");
  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.step, 1);
  assert.equal(sent[0]!.entry, "search");
  assert.equal(sent[0]!.test_key, "dummy-key");
  assert.ok(!JSON.stringify(sent[0]).includes("giftia_test"));
});

test("① trackFirstLoad: 目印なしは test_key なし・URL はそのまま。詳細 URL の入口は detail。保存が使えなければ送らない（S-116）", () => {
  const sent: Record<string, unknown>[] = [];
  const r = trackFirstLoad({ pathname: "/search", search: "?product=G0001" }, { local: mem(), session: mem(), now: 1, send: (b) => sent.push(b) });
  assert.equal(r.cleaned, null);
  assert.equal(sent[0]!.entry, "detail");
  assert.ok(!("test_key" in sent[0]!));
  const none: Record<string, unknown>[] = [];
  trackFirstLoad({ pathname: "/", search: "" }, { local: null, session: null, now: 1, send: (b) => none.push(b) });
  assert.equal(none.length, 0);
});

test("② R-01（SearchRunner）: 結果が出たとき段2（scene つき）。0件は段2のあとに段7（条件つき）。失敗・古い応答では送らない", async () => {
  const a = recorder();
  const run = new SearchRunner(() => {}, okJson({ items: [{ product_id: "G1", name: "a", price: 1, category: "食品", high_rating: false, reason: "r" }], count: 1 }) as never, a.tracker);
  run.run({ scene: "送別", priceBand: null });
  await flush();
  assert.deepEqual(a.calls, [[2, { scene: "送別" }]]);

  const b = recorder();
  new SearchRunner(() => {}, okJson({ items: [], count: 0 }) as never, b.tracker).run({ scene: "お礼", priceBand: "under3000", categories: ["食品"] });
  await flush();
  assert.deepEqual(b.calls, [[2, { scene: "お礼" }], [7, { zero_cond: "both" }]]);

  const c = recorder();
  new SearchRunner(() => {}, okJson({ items: [] }) as never, c.tracker).run({ scene: "誕生日", priceBand: null });
  await flush();
  assert.deepEqual(c.calls, [[2, { scene: "誕生日" }], [7, { zero_cond: "scene_only" }]]);

  const d = recorder();
  new SearchRunner(() => {}, (async () => ({ ok: false, json: async () => ({}) })) as never, d.tracker).run({ scene: "お礼", priceBand: null });
  await flush();
  assert.equal(d.calls.length, 0); // 失敗は記録しない

  const e = recorder();
  const r = new SearchRunner(() => {}, okJson({ items: [{}], count: 1 }) as never, e.tracker);
  r.run({ scene: "お礼", priceBand: null });
  r.cancel(); // 画面を離れた
  await flush();
  assert.equal(e.calls.length, 0);
});

test("② R-02（ProductRunner）: 結果が出たとき段2（シーンなし）。0件は段7（URL の条件から）。失敗では送らない", async () => {
  const mk = (body: unknown, ok = true) => (async () => ({ status: ok ? 200 : 500, ok, json: async () => body })) as unknown as typeof fetch;
  const list = (total: number) => ({ items: [], count: 0, total, page: 1, page_size: 12 });
  const a = recorder();
  new ProductRunner(() => {}, mk(list(30)), a.tracker).run("/api/products?price_band=under3000");
  await flush();
  assert.deepEqual(a.calls, [[2, undefined]]);

  const cases: [string, string][] = [["/api/products?price_band=under3000", "price"], ["/api/products?category=%E9%A3%9F%E5%93%81", "category"], ["/api/products?price_band=under3000&category=%E9%A3%9F%E5%93%81&page=2", "both"]];
  for (const [url, zc] of cases) {
    const b = recorder();
    new ProductRunner(() => {}, mk(list(0)), b.tracker).run(url);
    await flush();
    assert.deepEqual(b.calls, [[2, undefined], [7, { zero_cond: zc }]], url);
  }
  const none = recorder();
  new ProductRunner(() => {}, mk(list(0)), none.tracker).run("/api/products"); // 条件なしは 0 件にならない。記録しない
  await flush();
  assert.deepEqual(none.calls, [[2, undefined]]);

  const f = recorder();
  new ProductRunner(() => {}, mk({}, false), f.tracker).run("/api/products?price_band=under3000");
  await flush();
  assert.equal(f.calls.length, 0);
});

test("⑤ ShareLinkRunner: 作成に成功したときだけ段5。失敗では送らない。本文に商品 ID の並び以外を足さない", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const link = { share_id: "id1", path: "/s/id1", created_at: "2026-11-13T00:00:00Z", expires_at: "2026-12-13T00:00:00Z" };
    const ok = recorder();
    new ShareLinkRunner(() => {}, (async () => ({ ok: true, json: async () => link })) as never, ok.tracker).create(["G0001"]);
    await flush();
    assert.deepEqual(ok.calls, [[5, undefined]]);

    const ng = recorder();
    new ShareLinkRunner(() => {}, (async () => ({ ok: false, json: async () => ({}) })) as never, ng.tracker).create(["G0001"]);
    await flush();
    assert.equal(ng.calls.length, 0);

    const bad = recorder();
    new ShareLinkRunner(() => {}, (async () => ({ ok: true, json: async () => ({ nope: 1 }) })) as never, bad.tracker).create(["G0001"]);
    await flush();
    assert.equal(bad.calls.length, 0); // 形の違う応答は成功ではない
  } finally {
    mock.timers.reset();
  }
});

test("④ カートに入れたとき（どこから入れても）: add のたびに呼ぶ。同じ商品の +1 も呼ぶ。数量変更・削除では呼ばない", () => {
  let n = 0;
  const m = new Map<string, string>();
  const store = createCartStore(() => ({ getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) }), undefined, () => void n++);
  store.add("G0001");
  store.add("G0001");
  store.add("G0002");
  assert.equal(n, 3);
  store.setQty("G0001", 5);
  store.remove("G0002");
  assert.equal(n, 3);
});
