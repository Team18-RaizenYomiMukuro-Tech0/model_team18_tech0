import test from "node:test";
import assert from "node:assert/strict";
import { canResetLikes, HARISEN, likeEffect, LIKE_FAILED_MESSAGE, LikeController, resetLikeView, shouldPlayTsukkomi, TSUKKOMI, tsukkomiMode, likeGifs, addSevenMark, likeLabel, likesKey, loadLikedIds, SEVEN_REACH, sevenReachMode, shouldPlaySevenReach, type LikeView, type SharedItem } from "./sharedLink.ts";
import type { LikeResult } from "./api.ts";
import { canShowDetail, itemImage, detailHref, DETAIL_LABEL, fetchShared, itemNote, OTHERS_HREF, OTHERS_LABEL, SHARED_GUIDE, sharedUrl } from "./sharedLink.ts";

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
  assert.equal(SHARED_GUIDE, "プレゼントの候補を選びました。よいと思うものに『いいね』を押してください。"); // SP-06 S-42: 固定の案内文（一字も変えない）
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

test("likes U-97: いいねの数だけ画像を並べる。5 個まで・6 個目からは「＋N」（0・1・5・6・20 件。数でない値は 0）", () => {
  assert.deepEqual(likeGifs(0), { shown: 0, more: 0 });
  assert.deepEqual(likeGifs(1), { shown: 1, more: 0 });
  assert.deepEqual(likeGifs(5), { shown: 5, more: 0 });
  assert.deepEqual(likeGifs(6), { shown: 5, more: 1 });
  assert.deepEqual(likeGifs(20), { shown: 5, more: 15 });
  assert.deepEqual(likeGifs(-3), { shown: 0, more: 0 });
  assert.deepEqual(likeGifs(Number.NaN), { shown: 0, more: 0 });
});

test("likes U-97: 詳細パネルのいいねも共有一覧と同じ関数で並べる（0・1・5・6 件）", () => {
  // 共有ページの上で開く詳細パネルは LikeRow（共有一覧と同じ部品）に view.count を渡す。数の出し方は likeGifs だけ
  const view = (count: number) => likeGifs(count);
  assert.deepEqual([0, 1, 5, 6].map(view), [
    { shown: 0, more: 0 },
    { shown: 1, more: 0 },
    { shown: 5, more: 0 },
    { shown: 5, more: 1 },
  ]);
});

// ---- U-100 / U-101 / I-68（11/19）7 個目の演出「B リーチからの大当たり」（SP-28・設計 D-09）----
test("U-100 演出を出すかの判定: on・非 capped・押した後の数がちょうど 7 のときだけ true（印は持たない）", () => {
  const f = (on: boolean, capped: boolean, countAfter: unknown) => shouldPlaySevenReach({ on, capped, countAfter });
  assert.equal(f(true, false, 7), true); // ①
  assert.equal(f(true, false, 6), false); // ②
  assert.equal(f(true, false, 8), false); // ③
  assert.equal(f(true, true, 30), false); // ④
  assert.equal(f(false, false, 7), false); // ⑤ 取り消し
  assert.equal(f(true, false, 0), false); // ⑥
  for (const bad of [Number.NaN, "7", null, undefined, -7, -1, 7.5]) assert.equal(f(true, false, bad), false, String(bad)); // ⑦
  assert.equal(f(true, true, 7), false); // ⑧
  // ⑨ 取り消して 6 に戻した後の押し直し・⑩ 別の商品／詳細パネルの押し: 同じ関数・同じ入力で、何度でも true
  assert.equal(f(true, false, 7), true);
  assert.equal(f(true, false, 7), true);
});

test("U-100 ⑨⑩ LikeController: 7 になるたびに true（取り消して押し直しても・別の商品でも）。8 個目・取り消し・失敗・上限は false。判定の数は画面の数（応答の like_count ではない）", async () => {
  // 画面の数は 6。応答の like_count は 99 でも、画面の数＋1＝7 で判定する
  const { c } = ctl([mk("G1", 6), mk("G2", 6), mk("G3", 7)], [ok("G1", 99), ok("G1", 0), ok("G1", 0), ok("G2", 1), ok("G3", 1), ok("G3", 1)]);
  assert.equal(await c.toggle("G1"), true); // 6→7
  assert.equal(await c.toggle("G1"), false); // 取り消し 7→6
  assert.equal(await c.toggle("G1"), true); // 押し直し 6→7（印を持たない）
  assert.equal(await c.toggle("G2"), true); // 別の商品（詳細パネルの押しも同じ toggle）
  assert.equal(await c.toggle("G3"), false); // 7→8
  assert.equal(await c.toggle("nope"), false);
});

test("U-101 定数は設計 D-09 の表どおり。動きを減らす設定・動きの API が無い環境は印だけ", () => {
  assert.equal(SEVEN_REACH.threshold, 7);
  assert.equal(SEVEN_REACH.totalMs, 4700);
  assert.equal(SEVEN_REACH.reducedMs, 2000);
  assert.equal(SEVEN_REACH.reels, 3);
  assert.deepEqual([...SEVEN_REACH.symbols], ["7", "akabu", "♥"]);
  assert.equal(SEVEN_REACH.ringCount, 14);
  assert.equal(SEVEN_REACH.bigPx, 220);
  assert.equal(SEVEN_REACH.ringPx, 44);
  assert.equal(SEVEN_REACH.reach, "リーチ！");
  assert.equal(SEVEN_REACH.win, "7 人がいいね！");
  assert.equal(SEVEN_REACH.mark, "7 7 7");
  assert.equal(sevenReachMode({ reducedMotion: true, canAnimate: true }), "mark"); // ①
  assert.equal(sevenReachMode({ reducedMotion: false, canAnimate: true }), "overlay"); // ②
  assert.equal(sevenReachMode({ reducedMotion: false, canAnimate: false }), "mark"); // 動きの API が無い
});

test("U-101 音なし: 演出の部品は Audio・AudioContext を使わない。API・保存・計測の呼び出しも足していない", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../components/SevenReach.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(src, /\bAudio(Context)?\b|\.play\(\)\s*;?\s*\/\/ audio|new Audio/);
  assert.doesNotMatch(src, /fetch\(|track\(|localStorage|sessionStorage/);
});

test("I-68 順番: 応答が戻るまで演出（true）は出ず、戻った後、数・印・段 8 が先に確定してから true。失敗・打ち切り・上限は false で、通信は増えない", async () => {
  const log: string[] = [];
  let release: (r: LikeResult) => void = () => {};
  const mkC = (post: () => Promise<LikeResult>) => {
    let posts = 0;
    const c = new LikeController(SID, [mk("G1", 6)], mem(), (v) => log.push(`view:${v.G1.count}:${v.G1.liked}:${v.G1.failed}`), async () => {
      posts++;
      return post();
    }, (step) => void log.push(`track:${step}`));
    return { c, posts: () => posts };
  };
  // ① 応答を遅らせて 200 like_count＝7
  const a = mkC(() => new Promise<LikeResult>((r) => (release = r)));
  const p = a.c.toggle("G1");
  let settled = false;
  void p.then(() => (settled = true));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(settled, false); // 応答が戻るまで演出は出ない
  assert.deepEqual(log, []);
  release(ok("G1", 7));
  assert.equal(await p, true);
  assert.deepEqual(log, ["view:7:true:false", "track:8"]); // 数が 7・印・段 8 のあとに true（演出が先に始まらない）
  assert.equal(a.posts(), 1);
  // ② 500 ④ 上限 ③ 打ち切り（postLike は error を返す）
  for (const r of [{ status: "error" } as LikeResult, ok("G1", 30, true)]) {
    log.length = 0;
    const b = mkC(async () => r);
    assert.equal(await b.c.toggle("G1"), false);
    assert.equal(b.posts(), 1);
    assert.ok(!(log as string[]).includes("track:8"));
    assert.ok(!(log as string[]).includes("view:7:true:false"));
  }
});

test("U-101 動きを減らす版の印は商品ごと（7個目-11）: X の印が出ている間に Y が 7 になれば Y にも印。同じ商品の押し直しは出し直さない（7個目-14）", () => {
  const x = addSevenMark([], "X");
  assert.deepEqual(x, { marks: ["X"], start: true });
  const y = addSevenMark(x.marks, "Y"); // X の 2 秒の間に Y が 7 になる
  assert.deepEqual(y, { marks: ["X", "Y"], start: true });
  assert.deepEqual(addSevenMark(y.marks, "X"), { marks: ["X", "Y"], start: false }); // 同じ商品は出し直さない
});

// ---- U-102〜U-105 / I-69〜I-72（11/19）「6 個に戻す」と 8 個目以上のツッコミ（SP-28・設計 D-09。S 番号は S-137〜S-140 に改番）----
test("U-102 canResetLikes は 7 以上の整数だけ true。resetLikeView は count＞6 のとき 6・liked＝false・failed＝false。6 以下は変えない。保存・通信を呼ばない", () => {
  for (const n of [7, 8, 30]) assert.equal(canResetLikes(n), true, String(n));
  for (const n of [0, 5, 6, -1, -7, 7.5, Number.NaN, "8", null, undefined]) assert.equal(canResetLikes(n), false, String(n));
  assert.deepEqual(resetLikeView({ count: 7, liked: true, failed: false }), { count: 6, liked: false, failed: false });
  assert.deepEqual(resetLikeView({ count: 8, liked: false, failed: false }), { count: 6, liked: false, failed: false });
  assert.deepEqual(resetLikeView({ count: 30, liked: true, failed: true }), { count: 6, liked: false, failed: false });
  const six = { count: 6, liked: false, failed: false };
  assert.deepEqual(resetLikeView(six), six);
  const three = { count: 3, liked: true, failed: false };
  assert.deepEqual(resetLikeView(three), three);
  // 保存・通信を呼ばない: コントローラの reset は post・tracker・storage.setItem を 0 回しか呼ばない
  let posts = 0;
  let tracks = 0;
  const st = mem();
  let sets = 0;
  const storage = { getItem: st.getItem, setItem: (k: string, v: string) => (sets++, st.setItem(k, v)) };
  const c = new LikeController(SID, [mk("G1", 8)], storage, () => {}, async () => (posts++, ok("G1", 9)), () => void tracks++);
  c.reset("G1");
  assert.equal(c.snapshot.G1.count, 6);
  assert.equal(posts + tracks + sets, 0);
  c.reset("nope"); // 無い商品は何もしない
  c.reset("G1"); // 6 では何もしない
  assert.equal(c.snapshot.G1.count, 6);
});

test("U-103 戻した後の押しと 7 個目の演出: 8→6 の後 on・非 capped で 7 なら true。capped は false。何度戻しても出る。判定は画面の数だけ", () => {
  const f = (v: { count: number; liked: boolean; failed: boolean }, capped = false) => shouldPlaySevenReach({ on: !resetLikeView(v).liked, capped, countAfter: resetLikeView(v).count + 1 });
  const v8 = { count: 8, liked: false, failed: false };
  assert.equal(f(v8), true); // ① 6＋1＝7
  assert.equal(f(v8, true), false); // ② サーバーが上限
  assert.equal(f({ count: 30, liked: true, failed: false }), true); // ③ 何度でも（liked は戻る）
  assert.equal(f(v8), true);
});

test("U-104 ツッコミの判定: 8〜30 の整数だけ true。7 は大当たりの側（重ねない）。取り消し・上限・6・数でない値・負の数・31 は false", () => {
  const t = (on: boolean, capped: boolean, countAfter: unknown) => shouldPlayTsukkomi({ on, capped, countAfter });
  for (const n of [8, 9, 10, 30]) assert.equal(t(true, false, n), true, String(n)); // ①②
  assert.equal(t(true, false, 7), false); // ③
  assert.equal(shouldPlaySevenReach({ on: true, capped: false, countAfter: 7 }), true);
  assert.equal(t(true, false, 6), false); // ④
  assert.equal(t(false, false, 8), false); // ⑤
  assert.equal(t(true, true, 30), false); // ⑥
  for (const bad of [Number.NaN, "8", null, undefined, -8, -1, 31, 8.5]) assert.equal(t(true, false, bad), false, String(bad)); // ⑦
  // 大当たりとツッコミは重ならない（どちらか一方か、どちらも無し）
  for (let n = -2; n <= 33; n++) assert.ok(!(shouldPlaySevenReach({ on: true, capped: false, countAfter: n }) && t(true, false, n)), String(n));
  assert.equal(likeEffect({ on: true, capped: false, countAfter: 7 }), "seven");
  assert.equal(likeEffect({ on: true, capped: false, countAfter: 8 }), "tsukkomi");
  assert.equal(likeEffect({ on: true, capped: false, countAfter: 6 }), null);
});

test("U-104 LikeController: 初めて押した 8 人目（印なし）も、8 以上で押すたびにも tsukkomi。7→seven。取り消し・失敗・上限は無し。判定の数は画面の数（応答の like_count ではない）", async () => {
  const { c } = ctl([mk("G1", 7), mk("G2", 8), mk("G3", 30)], [ok("G1", 1), ok("G2", 1), ok("G2", 1), ok("G2", 1), ok("G3", 30, true), { status: "error" } as LikeResult]);
  assert.equal(await c.toggleEffect("G1"), "tsukkomi"); // 7→8（印なし）。応答の 1 は使わない
  assert.equal(await c.toggleEffect("G2"), "tsukkomi"); // 8→9
  assert.equal(await c.toggleEffect("G2"), null); // 取り消し
  assert.equal(await c.toggleEffect("G2"), "tsukkomi"); // 押し直し
  assert.equal(await c.toggleEffect("G3"), null); // 上限
  assert.equal(await c.toggleEffect("G3"), null); // 失敗
  assert.equal(await c.toggleEffect("nope"), null);
});

test("U-105 TSUKKOMI の定数・動きの切り替え・ハリセンの絵の決まり。音なし・計測なし・外部フォントなし", async () => {
  assert.equal(TSUKKOMI.minCount, 8);
  assert.equal(TSUKKOMI.totalMs, 2450);
  assert.equal(TSUKKOMI.reducedMs, 2000);
  assert.equal(TSUKKOMI.faceBigPx, 110);
  assert.equal(TSUKKOMI.ghosts, 2);
  assert.equal(TSUKKOMI.line, "押しすぎやろ！");
  assert.equal(TSUKKOMI.impact, "スパーン！");
  assert.equal(tsukkomiMode({ reducedMotion: true, canAnimate: true }), "mark"); // ①
  assert.equal(tsukkomiMode({ reducedMotion: false, canAnimate: true }), "overlay"); // ②
  assert.equal(tsukkomiMode({ reducedMotion: false, canAnimate: false }), "mark");
  assert.notEqual(TSUKKOMI.totalMs, SEVEN_REACH.totalMs); // 7 個目の値と混ざらない
  // ハリセンの絵: 折り目の面 14・光と影の色・赤い持ち手・白いテープ 3 本・山折りは白・谷折りは茶
  assert.equal(HARISEN.panels, 14);
  assert.deepEqual([...HARISEN.light], ["#FFFFFF", "#FBF5E6", "#E9DDBF"]);
  assert.deepEqual([...HARISEN.shade], ["#E9DCBA", "#D8C59A", "#BFA977"]);
  assert.equal(HARISEN.grip.color, "#D7261E");
  assert.equal(HARISEN.tapes.length, 3);
  assert.equal(HARISEN.mountLine.color, "rgba(255,255,255,.95)");
  assert.equal(HARISEN.valleyLine.color, "rgba(90,65,30,.55)");
  const { readFileSync } = await import("node:fs");
  for (const f of ["Tsukkomi.tsx", "Harisen.tsx", "tsukkomi.module.css"]) {
    const src = readFileSync(new URL(`../components/${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /\bAudio(Context)?\b|new Audio/, f);
    assert.doesNotMatch(src, /fetch\(|track\(|localStorage|sessionStorage/, f);
    assert.doesNotMatch(src, /googleapis|@import url|@font-face/, f); // 外部フォントを読み込まない
  }
  // 絵の面の数: 描いた SVG の面（data-panel）が 14（光 7・影 7）
  const svg = readFileSync(new URL("../components/Harisen.tsx", import.meta.url), "utf8");
  assert.match(svg, /length: H\.panels/);
});

test("I-69 「6 個に戻す」は通信しない。戻した後の押しは通常の 1 回で、画面の数は 7（応答の 9 は使わない）。段 8 は押しのたびに通常の条件で送る（1 訪問 1 行は track 側）", async () => {
  const log: string[] = [];
  const c = new LikeController(SID, [mk("G1", 8)], mem(), () => {}, async (_s, id, on) => (log.push(`post:${id}:${on}`), ok(id, 9)), (step) => void log.push(`track:${step}`));
  assert.equal(canResetLikes(c.snapshot.G1.count), true); // ① 数 8 の商品にだけ出る
  c.reset("G1"); // ②
  assert.equal(c.snapshot.G1.count, 6);
  assert.deepEqual(log, []); // ③ 通信 0 件・計測 0 件
  assert.equal(await c.toggleEffect("G1"), "seven"); // ④ 6＋1＝7（応答の 9 は使わない）
  assert.equal(c.snapshot.G1.count, 7);
  assert.deepEqual(log, ["post:G1:true", "track:8"]);
  c.reset("G1"); // ⑤ もう一度戻して押す
  assert.equal(await c.toggleEffect("G1"), "seven");
  assert.deepEqual((log as string[]).filter((x) => x.startsWith("post")), ["post:G1:true", "post:G1:true"]); // 常に on＝true の通常の押し
});

test("I-70 戻しはサーバーの数に触れない: 戻した後の POST は on＝true だけ。上限（capped）の商品は戻しても 7 にならず演出なし。再読込で数はサーバーの値に戻りボタンがまた出る", async () => {
  const log: Array<[string, boolean]> = [];
  const mkC = (items: SharedItem[], r: LikeResult[]) => new LikeController(SID, items, mem(), () => {}, async (_s, id, on) => (log.push([id, on]), r.shift() as LikeResult), () => {});
  const c = mkC([mk("G1", 8), mk("G2", 30)], [ok("G2", 30, true)]);
  c.reset("G1");
  c.reset("G2");
  assert.deepEqual(log, []); // ① 戻しは POST を送らない（サーバーの数は 8・30 のまま）
  assert.equal(await c.toggleEffect("G2"), null); // ③ 上限: 数は増えず演出なし
  assert.equal(c.snapshot.G2.count, 6);
  assert.deepEqual(log, [["G2", true]]);
  const reloaded = mkC([mk("G1", 8)], []); // ④ 再読込（サーバーの値で作り直す）
  assert.equal(reloaded.snapshot.G1.count, 8);
  assert.equal(canResetLikes(reloaded.snapshot.G1.count), true);
});

test("I-71 ツッコミを出す順番: 応答が戻るまで出ず、戻った後、数・印・段 8 が先に確定してから tsukkomi。失敗・上限・取り消しは出ず、通信は演出で増えない", async () => {
  const log: string[] = [];
  let release: (r: LikeResult) => void = () => {};
  const mkC = (items: SharedItem[], post: () => Promise<LikeResult>) => {
    let posts = 0;
    const c = new LikeController(SID, items, mem(), (v) => log.push(`view:${Object.values(v).map((x) => `${x.count}${x.liked ? "L" : ""}${x.failed ? "F" : ""}`).join(",")}`), async () => (posts++, post()), (step) => void log.push(`track:${step}`));
    return { c, posts: () => posts };
  };
  const a = mkC([mk("G1", 7)], () => new Promise<LikeResult>((r) => (release = r))); // ① 応答を 2 秒遅らせる想定
  const p = a.c.toggleEffect("G1");
  let settled = false;
  void p.then(() => (settled = true));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(settled, false);
  assert.deepEqual(log, []);
  release(ok("G1", 8));
  assert.equal(await p, "tsukkomi");
  assert.deepEqual(log, ["view:8L", "track:8"]); // 大当たりではない・数と段 8 のあとに判定
  assert.equal(a.posts(), 1);
  for (const r of [{ status: "error" } as LikeResult, ok("G1", 30, true)]) { // ② 500・③ 打ち切り（error）・④ 上限
    log.length = 0;
    const b = mkC([mk("G1", 7)], async () => r);
    assert.equal(await b.c.toggleEffect("G1"), null);
    assert.ok(!(log as string[]).includes("track:8"));
  }
  // ⑥ 別の商品が 8 になる ⑦ 取り消しでは出ない
  const d = mkC([mk("G1", 7), mk("G2", 7)], async () => ok("x", 8));
  assert.equal(await d.c.toggleEffect("G1"), "tsukkomi");
  assert.equal(await d.c.toggleEffect("G2"), "tsukkomi");
  assert.equal(await d.c.toggleEffect("G1"), null); // 取り消し
});

test("I-72 8 個目以上でも API は変わらない: 押しは on＝true の 1 項目だけ。応答の項目（product_id・like_count・capped）以外を画面は使わない。段 8 は押しのたびに 1 回で、演出の有無で変わらない", async () => {
  const calls: Array<[string, string, boolean]> = [];
  let tracks = 0;
  const c = new LikeController(SID, [mk("G1", 7)], mem(), () => {}, async (s, id, on) => (calls.push([s, id, on]), ok(id, 8 + calls.length)), () => void tracks++);
  assert.equal(await c.toggleEffect("G1"), "tsukkomi"); // ①
  assert.equal(await c.toggleEffect("G1"), null); // 取り消し
  assert.equal(await c.toggleEffect("G1"), "tsukkomi"); // ②
  assert.deepEqual(calls, [[SID, "G1", true], [SID, "G1", false], [SID, "G1", true]]);
  assert.equal(tracks, 2); // 取り消しは送らない
  const { readFileSync } = await import("node:fs");
  const api = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
  assert.doesNotMatch(api, /tsukkomi|harisen|reset/i); // API の層に新しい項目・呼び出しを足していない
});
