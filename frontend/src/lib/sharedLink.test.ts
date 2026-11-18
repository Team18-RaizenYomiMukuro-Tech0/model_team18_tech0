import test from "node:test";
import assert from "node:assert/strict";
import { LIKE_FAILED_MESSAGE, LikeController, likeLabel, likesKey, loadLikedIds, type LikeView, type SharedItem } from "./sharedLink.ts";
import type { LikeResult } from "./api.ts";
import { canShowDetail, itemImage, detailHref, DETAIL_LABEL, fetchShared, itemNote, OTHERS_HREF, OTHERS_LABEL, sharedUrl } from "./sharedLink.ts";

// SP-06 D-06 D-09 S-14〜S-17: 共有リンクの取得と、状態（表示・期限切れ・見つからない・失敗）の振り分け
const res = (status: number, body: unknown = {}): typeof fetch => (async () => ({ ok: status < 400, status, json: async () => body }) as Response) as typeof fetch;
const ITEMS = [
  { product_id: "G0003", status: "available", name: "C", price: 1500, reason: "理由C" },
  { product_id: "G0001", status: "discontinued", name: "A", price: 3000, reason: "理由A" },
  { product_id: "G0002", status: "out_of_stock", name: "B", price: 4000, reason: "理由B" },
];

test("sharedLink: 200 は保存された並び（選んだ順）のまま items を返す", async () => {
  const r = await fetchShared("abc", undefined, res(200, { created_at: "x", expires_at: "y", items: ITEMS }));
  assert.equal(r.status, "ok");
  if (r.status === "ok") assert.deepEqual(r.items.map((i) => i.product_id), ["G0003", "G0001", "G0002"]);
});

test("sharedLink: 410 は期限切れ、404 は見つからない、500・形の違う応答・通信の失敗は失敗", async () => {
  assert.deepEqual(await fetchShared("a", undefined, res(410)), { status: "expired" });
  assert.deepEqual(await fetchShared("a", undefined, res(404)), { status: "notfound" });
  assert.deepEqual(await fetchShared("a", undefined, res(500)), { status: "error" });
  assert.deepEqual(await fetchShared("a", undefined, res(200, { items: [{ name: "x" }] })), { status: "error" });
  assert.deepEqual(await fetchShared("a", undefined, res(200, { items: [{ ...ITEMS[0], status: "unknown" }] })), { status: "error" });
  assert.deepEqual(await fetchShared("a", undefined, (async () => { throw new Error("net"); }) as typeof fetch), { status: "error" });
});

test("sharedLink: 識別子は URL に通してから API に渡す。販売終了・在庫なしの文", () => {
  assert.equal(sharedUrl("ab_-Z9"), "/api/share-links/ab_-Z9");
  assert.equal(sharedUrl("a/b"), "/api/share-links/a%2Fb");
  assert.equal(itemNote("available"), null);
  assert.equal(itemNote("discontinued"), "この商品は販売終了しました");
  assert.equal(itemNote("out_of_stock"), "在庫なし");
});

// S-86 F-33 SP-06 K-6: くわしく見る（検索結果の詳細へ）・ほかの贈りものも探す（トップへ）
test("sharedLink S-86: 「くわしく見る」は /search?product=… へ。販売終了の候補には置かず、在庫なしには置く", () => {
  assert.equal(DETAIL_LABEL, "くわしく見る");
  assert.equal(detailHref("G0002"), "/search?product=G0002");
  assert.equal(canShowDetail("available"), true);
  assert.equal(canShowDetail("out_of_stock"), true);
  assert.equal(canShowDetail("discontinued"), false);
});

test("sharedLink S-86: 「ほかの贈りものも探す」はトップへ", () => {
  assert.equal(OTHERS_LABEL, "ほかの贈りものも探す");
  assert.equal(OTHERS_HREF, "/");
});

// S-87〜S-89 F-34 SP-28 D-39 D-47 N-17: いいね
const SID = "A".repeat(22);
const mk = (id: string, n?: number): SharedItem => ({ product_id: id, status: "available", name: id, price: 1000, reason: "r", ...(n === undefined ? {} : { like_count: n }) });
const mem = () => {
  const d = new Map<string, string>();
  return { d, getItem: (k: string) => d.get(k) ?? null, setItem: (k: string, v: string) => void d.set(k, v) };
};
function ctl(items: SharedItem[], results: LikeResult[], storage: ReturnType<typeof mem> | null = mem()) {
  const calls: [string, boolean][] = [];
  const views: Record<string, LikeView>[] = [];
  const c = new LikeController(SID, items, storage, (v) => views.push({ ...v }), async (_s, id, on) => {
    calls.push([id, on]);
    return results.shift() as LikeResult;
  });
  return { c, calls, views, storage };
}
const ok = (id: string, n: number, capped = false): LikeResult => ({ status: "ok", product_id: id, like_count: n, capped });

test("likes S-87: 文言。数は like_count（無ければ 0）。押すと +1・「いいねした」・印を保存、もう一度押すと取り消し（-1・印を消す）", async () => {
  assert.equal(likeLabel(false), "いいね");
  assert.equal(likeLabel(true), "いいねした");
  const { c, calls, storage } = ctl([mk("G1"), mk("G2", 4)], [ok("G1", 1), ok("G1", 0)]);
  assert.deepEqual(c.snapshot.G1, { count: 0, liked: false, failed: false });
  assert.equal(c.snapshot.G2.count, 4);
  await c.toggle("G1");
  assert.deepEqual(c.snapshot.G1, { count: 1, liked: true, failed: false });
  assert.deepEqual(JSON.parse(storage?.d.get(likesKey(SID)) ?? "null"), ["G1"]);
  await c.toggle("G1");
  assert.deepEqual(c.snapshot.G1, { count: 0, liked: false, failed: false });
  assert.deepEqual(JSON.parse(storage?.d.get(likesKey(SID)) ?? "null"), []);
  assert.deepEqual(calls, [["G1", true], ["G1", false]]);
});

test("likes S-87: 開き直しても押した状態のまま（印は giftia:likes:{share_id}）。ほかのリンクの印は混ざらない。別の候補は押せる", async () => {
  const st = mem();
  st.d.set(likesKey(SID), JSON.stringify(["G1"]));
  st.d.set(likesKey("B".repeat(22)), JSON.stringify(["G2"]));
  const { c } = ctl([mk("G1", 1), mk("G2", 0)], [ok("G2", 1)], st);
  assert.equal(c.snapshot.G1.liked, true);
  assert.equal(c.snapshot.G2.liked, false);
  await c.toggle("G2");
  assert.equal(c.snapshot.G2.liked, true);
  assert.deepEqual(JSON.parse(st.d.get(likesKey(SID)) ?? "null").sort(), ["G1", "G2"]);
});

test("likes S-87: 数は 0 を下回らない", async () => {
  const st = mem();
  st.d.set(likesKey(SID), JSON.stringify(["G1"]));
  const { c } = ctl([mk("G1", 0)], [ok("G1", 0)], st);
  await c.toggle("G1");
  assert.equal(c.snapshot.G1.count, 0);
});

test("likes S-88 ①: 上限（capped）は印を付けず・数も増やさず・文言なし・保存もしない。もう一度押しても取り消しを送らない（on:true を送る）", async () => {
  const { c, calls, storage } = ctl([mk("G1", 30)], [ok("G1", 30, true), ok("G1", 30, true)]);
  await c.toggle("G1");
  assert.deepEqual(c.snapshot.G1, { count: 30, liked: false, failed: false });
  assert.equal(storage?.d.get(likesKey(SID)), undefined);
  await c.toggle("G1");
  assert.deepEqual(calls, [["G1", true], ["G1", true]]); // 印が無いので取り消し（on:false）は送らない
  assert.equal(c.snapshot.G1.count, 30);
});

test("likes S-88 ②: 失敗・期限切れ・見つからない・10秒打ち切り（error）は文言を出し、印も数も押す前のまま、もう一度押せる", async () => {
  assert.equal(LIKE_FAILED_MESSAGE, "いいねできませんでした。もう一度お試しください");
  const { c, calls } = ctl([mk("G1", 2)], [{ status: "error" }, { status: "expired" }, { status: "notfound" }, ok("G1", 3)]);
  for (let i = 0; i < 3; i++) {
    await c.toggle("G1");
    assert.deepEqual(c.snapshot.G1, { count: 2, liked: false, failed: true });
  }
  await c.toggle("G1");
  assert.deepEqual(c.snapshot.G1, { count: 3, liked: true, failed: false }); // 成功で文言が消える
  assert.equal(calls.length, 4);
});

test("likes S-88 ⑤: 保存が使えない・壊れた印でも押せる（印は残らない）", async () => {
  const { c } = ctl([mk("G1")], [ok("G1", 1)], null);
  await c.toggle("G1");
  assert.equal(c.snapshot.G1.liked, true);
  const bad = mem();
  bad.d.set(likesKey(SID), "{abc");
  assert.deepEqual(loadLikedIds(bad, SID), []);
  assert.deepEqual(loadLikedIds(null, SID), []);
  const throwing = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); } };
  const t = new LikeController(SID, [mk("G1")], throwing, () => {}, async () => ok("G1", 1));
  await t.toggle("G1");
  assert.equal(t.snapshot.G1.liked, true);
});

test("likes S-87: 応答待ちの連打は 1 回だけ送る。画面を離れたあとの応答は捨てる", async () => {
  let release: (r: LikeResult) => void = () => {};
  let n = 0;
  const views: unknown[] = [];
  const c = new LikeController(SID, [mk("G1")], mem(), (v) => views.push(v), () => {
    n++;
    return new Promise<LikeResult>((r) => (release = r));
  });
  const p = c.toggle("G1");
  void c.toggle("G1");
  c.dispose();
  release(ok("G1", 1));
  await p;
  assert.equal(n, 1);
  assert.equal(views.length, 0);
});

test("likes SP-28: 第1弾の応答（like_count なし）も開ける。like_count が数でなければ失敗", async () => {
  const items = [{ product_id: "G1", status: "available", name: "A", price: 1, reason: "r" }];
  const okRes = (async () => ({ ok: true, status: 200, json: async () => ({ items }) }) as Response) as typeof fetch;
  assert.equal((await fetchShared(SID, undefined, okRes)).status, "ok");
  const badRes = (async () => ({ ok: true, status: 200, json: async () => ({ items: [{ ...items[0], like_count: "3" }] }) }) as Response) as typeof fetch;
  assert.equal((await fetchShared(SID, undefined, badRes)).status, "error");
});

// S-86 F-33 SP-06 案A: 画像は items[].category のカテゴリー共通イラスト。category が無い・知らないときは画像なし
test("sharedLink S-86: 画像は category で選ぶ。無い・知らないカテゴリーは画像なし。第1弾の応答（category なし）も開ける", async () => {
  assert.equal(itemImage({ category: "食品" }), "/products/food.svg");
  assert.equal(itemImage({}), null);
  assert.equal(itemImage({ category: "存在しない" }), null);
  const withCat = [{ product_id: "G1", status: "available", name: "A", price: 1, reason: "r", category: "食品" }];
  const okRes = (async () => ({ ok: true, status: 200, json: async () => ({ items: withCat }) }) as Response) as typeof fetch;
  assert.equal((await fetchShared("A".repeat(22), undefined, okRes)).status, "ok");
  const badRes = (async () => ({ ok: true, status: 200, json: async () => ({ items: [{ ...withCat[0], category: 5 }] }) }) as Response) as typeof fetch;
  assert.equal((await fetchShared("A".repeat(22), undefined, badRes)).status, "error");
});

// ---- U-95（11/18）段 8 を送る条件: いいねの API が 200・on＝true・capped＝false のときだけ。share_id は押した共有ページの値 ----
type T8 = [number, { share_id?: string } | undefined];
const run8 = async (post: (s: string, id: string, on: boolean) => Promise<LikeResult>, steps: Array<[string, boolean?]>, storage = mem()) => {
  const calls: T8[] = [];
  const c = new LikeController(SID, [mk("G1", 0), mk("G2", 0)], storage, () => {}, async (s, id, on) => post(s, id, on), (step, extra) => void calls.push([step, extra]));
  for (const [id] of steps) await c.toggle(id);
  return { calls, c };
};

test("U-95 ① 200・on＝true・capped＝false だけ段8。share_id は押した共有ページの値で、scene・entry・zero_cond・detail_count は入らない", async () => {
  const { calls } = await run8(async (_s, id) => ok(id, 1), [["G1"]]);
  assert.deepEqual(calls, [[8, { share_id: SID }]]);
});

test("U-95 ② capped＝true・③ 取り消し（on＝false）・④ 500／通信エラー／応答しない は段8を作らず、画面にも出さない・再試行しない", async () => {
  const capped = await run8(async (_s, id) => ok(id, 30, true), [["G1"]]);
  assert.equal(capped.calls.length, 0);
  // ③ 押してから取り消す: 8 は最初の「いいね」の 1 回だけ（取り消しでは送らない）
  const undo = await run8(async (_s, id, on) => ok(id, on ? 1 : 0), [["G1"], ["G1"]]);
  assert.equal(undo.calls.length, 1);
  const err = await run8(async () => ({ status: "error" }), [["G1"]]);
  assert.equal(err.calls.length, 0);
  const thrown = await run8(async () => ({ status: "expired" }), [["G1"]]);
  assert.equal(thrown.calls.length, 0);
});

test("U-95 ⑤ 別の商品にも繰り返す: 画面は押すたびに段8を渡すが、1 訪問 1 行は受け口の UNIQUE（track 側は訪問ごと同じ share_id）", async () => {
  const { calls } = await run8(async (_s, id) => ok(id, 1), [["G1"], ["G2"]]);
  assert.deepEqual(calls.map((c) => c[0]), [8, 8]);
  assert.ok(calls.every((c) => c[1]?.share_id === SID));
});

test("U-95 ⑥ 保存が使えない: track が送信しない（本物の track・保存なし）。いいね自体は押せる", async () => {
  const sent: Record<string, unknown>[] = [];
  const { track: realTrack } = await import("./tracking.ts");
  const c = new LikeController(SID, [mk("G1", 0)], null, () => {}, async (_s, id) => ok(id, 1), (step, extra) => void realTrack(step, extra, { local: null, session: null, send: (b) => void sent.push(b) }));
  await c.toggle("G1");
  assert.equal(c.snapshot.G1!.liked, true);
  assert.equal(sent.length, 0);
});

test("U-95 ⑦⑧ 本物の track: トップから始まった訪問で共有ページ L を押す → share_id＝L。L1 から始まった訪問で L2 を押す → 段8 は L2、段1 は L1", async () => {
  const { track: realTrack } = await import("./tracking.ts");
  const L = "L".repeat(22);
  const L2 = "M".repeat(22);
  const store = new Map<string, string>();
  const local = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
  const sent: Record<string, unknown>[] = [];
  const mkTrack = (path: string): import("./tracking.ts").Tracker => (step, extra) => void realTrack(step, extra, { local, session: null, send: (b) => void sent.push(b), loc: { pathname: path, search: "" } });
  // ⑦ トップから始まる（段 1）
  realTrack(1, { entry: "top" }, { local, session: null, send: (b) => void sent.push(b), loc: { pathname: "/", search: "" } });
  await new LikeController(L, [mk("G1", 0)], null, () => {}, async (_s, id) => ok(id, 1), mkTrack(`/s/${L}`)).toggle("G1");
  assert.equal(sent.find((b) => b.step === 1)!.share_id, undefined);
  assert.equal(sent.find((b) => b.step === 8)!.share_id, L);
  // ⑧ L1 から始まった訪問（新しい保存）で L2 を押す
  store.clear();
  sent.length = 0;
  realTrack(1, { entry: "share" }, { local, session: null, send: (b) => void sent.push(b), loc: { pathname: `/s/${L}`, search: "" } });
  await new LikeController(L2, [mk("G1", 0)], null, () => {}, async (_s, id) => ok(id, 1), mkTrack(`/s/${L2}`)).toggle("G1");
  assert.equal(sent.find((b) => b.step === 1)!.share_id, L);
  assert.equal(sent.find((b) => b.step === 8)!.share_id, L2);
});
