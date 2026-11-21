import test from "node:test";
import assert from "node:assert/strict";
import { canResetLikes, HARISEN, likeEffect, LIKE_FAILED_MESSAGE, LikeController, resetLikeView, shouldPlayTsukkomi, TSUKKOMI, tsukkomiMode, likeGifs, addSevenMark, likeLabel, likesKey, loadLikeCounts, canAddLike, canRemoveLike, likeLimitMessage, readOwnCount, LIKE_PER_BROWSER, LIKE_TOTAL_MAX, LIKE_OWN_FULL_MESSAGE, LIKE_TOTAL_FULL_MESSAGE, LIKE_MINUS_LABEL, SEVEN_REACH, sevenReachMode, shouldPlaySevenReach, type LikeView, type SharedItem } from "./sharedLink.ts";
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

test("likes S-87: 文言。数は like_count（無ければ 0）。押すと自分の個数 +1・「いいねした」・新しい形式で保存、「−」で −1（個数 0 の商品は書かない）", async () => {
  assert.equal(likeLabel(false), "いいね");
  assert.equal(likeLabel(true), "いいねした");
  const { c, calls, storage } = ctl([mk("G1"), mk("G2", 4)], [ok("G1", 1), ok("G1", 0)]);
  assert.deepEqual(c.snapshot.G1, { count: 0, own: 0, failed: false });
  assert.equal(c.snapshot.G2.count, 4);
  await c.add("G1");
  assert.deepEqual(c.snapshot.G1, { count: 1, own: 1, failed: false });
  assert.deepEqual(JSON.parse(storage?.d.get(likesKey(SID)) ?? "null"), { G1: 1 });
  await c.remove("G1");
  assert.deepEqual(c.snapshot.G1, { count: 0, own: 0, failed: false });
  assert.deepEqual(JSON.parse(storage?.d.get(likesKey(SID)) ?? "null"), {}); // 0 個の商品は書かない
  assert.deepEqual(calls, [["G1", true], ["G1", false]]);
});

test("likes S-87: 開き直しても自分の個数は残る（giftia:likes:{share_id}）。ほかのリンクの個数は混ざらない。別の候補は押せる", async () => {
  const st = mem();
  st.d.set(likesKey(SID), JSON.stringify({ G1: 3 }));
  st.d.set(likesKey("B".repeat(22)), JSON.stringify({ G2: 2 }));
  const { c } = ctl([mk("G1", 3), mk("G2", 0)], [ok("G2", 1)], st);
  assert.equal(c.snapshot.G1.own, 3);
  assert.equal(c.snapshot.G2.own, 0);
  await c.add("G2");
  assert.equal(c.snapshot.G2.own, 1);
  assert.deepEqual(JSON.parse(st.d.get(likesKey(SID)) ?? "null"), { G1: 3, G2: 1 });
});

test("likes S-87: 数は 0 を下回らない（応答の合計に合わせ、自分の個数も 0 を下回らない）", async () => {
  const st = mem();
  st.d.set(likesKey(SID), JSON.stringify({ G1: 1 }));
  const { c } = ctl([mk("G1", 0)], [ok("G1", 0)], st);
  await c.remove("G1");
  assert.deepEqual(c.snapshot.G1, { count: 0, own: 0, failed: false });
  await c.remove("G1"); // 自分が 0 個: 何も送らない
  assert.deepEqual(c.snapshot.G1, { count: 0, own: 0, failed: false });
});

test("likes S-88 ①: 上限（capped）は自分の個数を増やさず・数を応答の合計（30）に合わせ・保存もしない。30 になった「いいね」は押せず送らない（5個-10 A・5個-17 A）", async () => {
  const { c, calls, storage } = ctl([mk("G1", 25), mk("G2", 30)], [ok("G1", 30, true)]);
  await c.add("G1");
  assert.deepEqual(c.snapshot.G1, { count: 30, own: 0, failed: false });
  assert.equal(storage?.d.get(likesKey(SID)), undefined);
  await c.add("G1"); // 数 30: 押せない（送らない）
  await c.add("G2"); // 開いたときに 30: 押せない
  assert.deepEqual(calls, [["G1", true]]);
  await c.remove("G1"); // 自分が 0 個: 取り消しも送らない（R3）
  assert.deepEqual(calls, [["G1", true]]);
  assert.equal(c.snapshot.G1.count, 30);
});

test("likes S-88 ②: 失敗・期限切れ・見つからない・10秒打ち切り（error）は文言を出し、数も自分の個数も押す前のまま、もう一度押せる", async () => {
  assert.equal(LIKE_FAILED_MESSAGE, "いいねできませんでした。もう一度お試しください");
  const { c, calls } = ctl([mk("G1", 2)], [{ status: "error" }, { status: "expired" }, { status: "notfound" }, ok("G1", 3)]);
  for (let i = 0; i < 3; i++) {
    await c.add("G1");
    assert.deepEqual(c.snapshot.G1, { count: 2, own: 0, failed: true });
  }
  await c.add("G1");
  assert.deepEqual(c.snapshot.G1, { count: 3, own: 1, failed: false }); // 成功で文言が消える
  assert.equal(calls.length, 4);
});

test("likes S-88 ⑤: 保存が使えない・壊れた保存でも押せる（個数はページを開いている間だけ。再読込で 0。5個-6 A）", async () => {
  const { c } = ctl([mk("G1")], [ok("G1", 1)], null);
  await c.add("G1");
  assert.equal(c.snapshot.G1.own, 1);
  const bad = mem();
  bad.d.set(likesKey(SID), "{abc");
  assert.deepEqual(loadLikeCounts(bad, SID), {});
  assert.deepEqual(loadLikeCounts(null, SID), {});
  const throwing = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); } };
  const t = new LikeController(SID, [mk("G1")], throwing, () => {}, async () => ok("G1", 1));
  await t.add("G1");
  assert.equal(t.snapshot.G1.own, 1);
  // 保存が使えなくても 5 個で止まる。再読込（作り直し）で 0 に戻る
  const calls: number[] = [];
  const n = new LikeController(SID, [mk("G1")], null, () => {}, async () => (calls.push(1), ok("G1", calls.length)), () => {});
  for (let i = 0; i < 7; i++) await n.add("G1");
  assert.equal(n.snapshot.G1.own, 5);
  assert.equal(calls.length, 5);
  const again = new LikeController(SID, [mk("G1", 5)], null, () => {}, async () => ok("G1", 6), () => {});
  assert.equal(again.snapshot.G1.own, 0);
});

test("likes U-84 D-47: 自分の個数の保存。古い形・新しい形・5 より大きい値・0 より小さい値・読めない値・整数でない値・保存が使えない状態", async () => {
  const read = (raw: string | null) => {
    const st = mem();
    if (raw !== null) st.d.set(likesKey(SID), raw);
    return loadLikeCounts(st, SID);
  };
  assert.deepEqual(read('["G0001"]'), { G0001: 1 }); // ① 古い形は各 1 個（5個-9 A）
  assert.deepEqual(read('["G0001","G0002"]'), { G0001: 1, G0002: 1 });
  assert.deepEqual(read('{"G0001":3}'), { G0001: 3 }); // ② 新しい形式
  assert.deepEqual(read('{"G0001":9}'), { G0001: 5 }); // ③ 5 より大きい値は 5
  assert.deepEqual(read('{"G0001":-2}'), {}); // 0 より小さい値は 0（個数なし）
  for (const bad of ["{abc", "abc", '"abc"', "null", "", "42", "true"]) assert.deepEqual(read(bad), {}, bad); // ④ 空・壊れた JSON・文字
  assert.deepEqual(read('{"A":2.5,"B":"3","C":null,"D":"","E":true,"F":[1]}'), {}, "整数でない値はすべて 0（5個-18 A）");
  assert.deepEqual(read(null), {});
  assert.deepEqual(loadLikeCounts(null, SID), {}); // ⑤ 保存が使えない
  for (const [v, want] of [[0, 0], [1, 1], [5, 5], [6, 5], [100, 5], [-1, 0], [2.5, 0], ["3", 0], [null, 0], [undefined, 0], [Number.NaN, 0]] as const) assert.equal(readOwnCount(v), want, String(v));
  // 個数は「共有リンク × 商品」ごと。同じリンクの別の商品・別のリンクの同じ商品は混ざらない
  const st = mem();
  st.d.set(likesKey(SID), JSON.stringify({ G1: 2 }));
  st.d.set(likesKey("B".repeat(22)), JSON.stringify({ G1: 4, G2: 5 }));
  assert.deepEqual(loadLikeCounts(st, SID), { G1: 2 });
  assert.deepEqual(loadLikeCounts(st, "B".repeat(22)), { G1: 4, G2: 5 });
  // 書くときは新しい形式（商品 ID → 個数。0 個の商品は書かない）。5 個の商品は「いいね」を送らない。1〜5 個の「−」は取り消し（on＝false）を送る
  const w = mem();
  w.d.set(likesKey(SID), '["G1"]'); // 古い形で始める
  const { c, calls } = ctl([mk("G1", 1), mk("G2", 0)], [ok("G2", 1), ok("G1", 0)], w);
  await c.add("G2");
  assert.deepEqual(JSON.parse(w.d.get(likesKey(SID)) ?? "null"), { G1: 1, G2: 1 });
  await c.remove("G1");
  assert.deepEqual(JSON.parse(w.d.get(likesKey(SID)) ?? "null"), { G2: 1 });
  assert.deepEqual(calls, [["G2", true], ["G1", false]]);
});

test("likes U-106 D-09 D-47: 1 人 5 個まで。canAddLike・canRemoveLike の表と、LikeController の ①〜⑧", async () => {
  assert.equal(LIKE_PER_BROWSER, 5);
  assert.equal(LIKE_TOTAL_MAX, 30);
  for (const own of [0, 1, 4]) for (const count of [0, 29]) assert.equal(canAddLike(own, count), true, `${own}/${count}`);
  for (const count of [30, 31]) assert.equal(canAddLike(0, count), false, String(count));
  for (const own of [5, 6, -1, 2.5, Number.NaN, "2", null, undefined]) assert.equal(canAddLike(own, 0), false, String(own));
  assert.equal(canAddLike(0, "0"), false);
  for (const own of [1, 2, 5]) assert.equal(canRemoveLike(own), true, String(own));
  for (const own of [0, 6, -1, 2.5, Number.NaN, "2", null, undefined]) assert.equal(canRemoveLike(own), false, String(own));
  // ① 数 0 の商品に「いいね」を 5 回（応答は毎回 200・capped＝false・like_count が 1〜5）② 6 回目
  const tracks: number[] = [];
  const mkC = (items: SharedItem[], results: LikeResult[], st: ReturnType<typeof mem> | null = mem()) => {
    const calls: [string, boolean][] = [];
    const c = new LikeController(SID, items, st, () => {}, async (_s, id, on) => (calls.push([id, on]), results.shift() as LikeResult), (step) => void tracks.push(step));
    return { c, calls };
  };
  const a = mkC([mk("X", 0)], [1, 2, 3, 4, 5].map((n) => ok("X", n)));
  for (let i = 0; i < 5; i++) await a.c.add("X");
  assert.deepEqual(a.c.snapshot.X, { count: 5, own: 5, failed: false });
  assert.equal(a.calls.length, 5);
  assert.ok(a.calls.every(([, on]) => on === true));
  assert.deepEqual(tracks, [8, 8, 8, 8, 8]); // 段 8 を送る関数を押すたびに呼ぶ（1 訪問 1 行は受け口の UNIQUE。I-73）
  await a.c.add("X"); // ② 何も送らない
  assert.equal(a.calls.length, 5);
  assert.deepEqual(a.c.snapshot.X, { count: 5, own: 5, failed: false });
  // ③ 「−」を 5 回（on＝false）④ 6 回目の「−」（自分 0 個）
  const trk = tracks.length;
  const m = mkC([mk("X", 5)], [4, 3, 2, 1, 0].map((n) => ok("X", n)), (() => { const s = mem(); s.d.set(likesKey(SID), JSON.stringify({ X: 5 })); return s; })());
  for (let i = 0; i < 5; i++) await m.c.remove("X");
  assert.deepEqual(m.c.snapshot.X, { count: 0, own: 0, failed: false });
  assert.deepEqual(m.calls, Array.from({ length: 5 }, () => ["X", false]));
  await m.c.remove("X");
  assert.equal(m.calls.length, 5);
  assert.equal(tracks.length, trk); // 「−」では段 8 を呼ばない
  // ⑤ 自分 2 個のあと、応答が capped＝true・like_count＝30 の押し
  const st5 = mem();
  st5.d.set(likesKey(SID), JSON.stringify({ X: 2 }));
  const f = mkC([mk("X", 10)], [ok("X", 30, true)], st5);
  assert.equal(await f.c.add("X"), null);
  assert.deepEqual(f.c.snapshot.X, { count: 30, own: 2, failed: false });
  assert.equal(canAddLike(f.c.snapshot.X.own, f.c.snapshot.X.count), false); // 「いいね」は押せなくなる
  assert.equal(canRemoveLike(f.c.snapshot.X.own), true); // 「−」は自分が 1 個以上なら使える（5個-10 A）
  // ⑥ 失敗の押し・「−」
  const e = mkC([mk("X", 4)], [{ status: "error" }, { status: "error" }], (() => { const s = mem(); s.d.set(likesKey(SID), JSON.stringify({ X: 1 })); return s; })());
  await e.c.add("X");
  assert.deepEqual(e.c.snapshot.X, { count: 4, own: 1, failed: true });
  await e.c.remove("X");
  assert.deepEqual(e.c.snapshot.X, { count: 4, own: 1, failed: true });
  // ⑦ 応答待ちの間の連打は 2 回目を送らない
  let release: (r: LikeResult) => void = () => {};
  let posts = 0;
  const busy = new LikeController(SID, [mk("X", 0)], mem(), () => {}, () => (posts++, new Promise<LikeResult>((r) => (release = r))), () => {});
  const first = busy.add("X");
  assert.equal(await busy.add("X"), null);
  await busy.remove("X");
  release(ok("X", 1));
  await first;
  assert.equal(posts, 1);
  // ⑧ 応答の like_count が自分の押しより大きい（ほかの人も押している。4→9）: 画面の数は応答に合い、自分は +1
  const o = mkC([mk("X", 4)], [ok("X", 9)]);
  await o.c.add("X");
  assert.deepEqual(o.c.snapshot.X, { count: 9, own: 1, failed: false });
});

test("likes U-87 D-46: いいねの表示の状態。自分 0・3・5 個／数 30 の「いいね」の押せる・押せない、押せない理由の文言、「−」の出し分けと読み上げ名", async () => {
  assert.equal(LIKE_OWN_FULL_MESSAGE, "5個まで押せます");
  assert.equal(LIKE_TOTAL_FULL_MESSAGE, "いいねは30個までです");
  assert.equal(LIKE_MINUS_LABEL, "いいねを1つ減らす");
  const row = (own: number, count: number) => ({ add: canAddLike(own, count), minus: canRemoveLike(own), note: likeLimitMessage(own, count), pressed: own >= 1 });
  assert.deepEqual(row(0, 0), { add: true, minus: false, note: null, pressed: false }); // 押す前
  assert.deepEqual(row(3, 10), { add: true, minus: true, note: null, pressed: true });
  assert.deepEqual(row(5, 10), { add: false, minus: true, note: "5個まで押せます", pressed: true });
  assert.deepEqual(row(0, 30), { add: false, minus: false, note: "いいねは30個までです", pressed: false }); // 開いたときに 30
  assert.deepEqual(row(5, 30), { add: false, minus: true, note: "いいねは30個までです", pressed: true }); // 5 個かつ 30 は 30 の文言
  assert.deepEqual(row(2, 30), { add: false, minus: true, note: "いいねは30個までです", pressed: true });
  // 部品の決まり（読み上げ・押せる大きさ・押せない状態）
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../components/LikeRow.tsx", import.meta.url), "utf8");
  assert.match(src, /disabled=\{!canAdd\}/); // 本当に押せない状態
  assert.match(src, /aria-label=\{LIKE_MINUS_LABEL\}/);
  assert.match(src, /自分のいいね \{v\.own\} \/ \{LIKE_PER_BROWSER\}/);
  assert.match(src, /aria-pressed=\{v\.own >= 1\}/);
  assert.match(src, /canRemove && \(/); // 0 個では「−」を出さない
  const css = readFileSync(new URL("../components/shared.module.css", import.meta.url), "utf8");
  assert.match(css, /\.minus \{[^}]*width: 44px; height: 44px;[^}]*border-radius: 50%/);
  assert.match(css, /\.like:disabled \{[^}]*opacity/);
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
  for (const [id, plus] of steps) await (plus === false ? c.remove(id) : c.add(id)); // [id, false] は「−」
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
  const undo = await run8(async (_s, id, on) => ok(id, on ? 1 : 0), [["G1"], ["G1", false]]);
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
  await c.add("G1");
  assert.equal(c.snapshot.G1!.own, 1);
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

test("U-100 ⑨⑩ LikeController: 応答の合計が 7 になるたびに true（「−」で戻して押し直しても・別の商品でも）。8 個目・「−」・失敗・上限は false。判定の数は応答の合計（画面の数ではない。12A）", async () => {
  const { c } = ctl([mk("G1", 6), mk("G2", 6), mk("G3", 7)], [ok("G1", 7), ok("G1", 6), ok("G1", 7), ok("G2", 7), ok("G3", 8), ok("G3", 99)]);
  assert.equal(await c.toggle("G1"), true); // 応答 7
  await c.remove("G1"); // 「−」: 演出なし（戻り値なし）
  assert.equal(await c.toggle("G1"), true); // 押し直し（印を持たない）
  assert.equal(await c.toggle("G2"), true); // 別の商品（詳細パネルの押しも同じ add）
  assert.equal(await c.toggle("G3"), false); // 応答 8
  assert.equal(await c.toggle("nope"), false);
  // 画面の数が 6 でも、応答が 9 なら 7 個目ではない（応答の合計で決める）
  const { c: d } = ctl([mk("G1", 6)], [ok("G1", 9)]);
  assert.equal(await d.toggle("G1"), false);
  assert.equal(d.snapshot.G1.count, 9); // 画面の数も応答の合計に合う
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
  assert.equal(SEVEN_REACH.win, "ラッキー 7 いいね！"); // 数を言う文言（人数ではない。PM 11/19 3B・5個-8 C）
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

test("I-68 順番: 応答が戻るまで演出（true）は出ず、戻った後、数・自分の個数・段 8 が先に確定してから true。失敗・打ち切り・上限は false で、通信は増えない", async () => {
  const log: string[] = [];
  let release: (r: LikeResult) => void = () => {};
  const mkC = (post: () => Promise<LikeResult>) => {
    let posts = 0;
    const c = new LikeController(SID, [mk("G1", 6)], mem(), (v) => log.push(`view:${v.G1.count}:${v.G1.own}:${v.G1.failed}`), async () => {
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
  assert.deepEqual(log, ["view:7:1:false", "track:8"]); // 数が 7・印・段 8 のあとに true（演出が先に始まらない）
  assert.equal(a.posts(), 1);
  // ② 500 ④ 上限 ③ 打ち切り（postLike は error を返す）
  for (const r of [{ status: "error" } as LikeResult, ok("G1", 30, true)]) {
    log.length = 0;
    const b = mkC(async () => r);
    assert.equal(await b.c.toggle("G1"), false);
    assert.equal(b.posts(), 1);
    assert.ok(!(log as string[]).includes("track:8"));
    assert.ok(!(log as string[]).includes("view:7:1:false"));
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
test("U-102 canResetLikes は 7 以上の整数だけ true。resetLikeView は count＞6 のとき count＝6・own＝0（自分の個数も 0。5個-5 A）・failed＝false。6 以下は変えない。保存・通信を呼ばない", () => {
  for (const n of [7, 8, 30]) assert.equal(canResetLikes(n), true, String(n));
  for (const n of [0, 5, 6, -1, -7, 7.5, Number.NaN, "8", null, undefined]) assert.equal(canResetLikes(n), false, String(n));
  assert.deepEqual(resetLikeView({ count: 7, own: 3, failed: false }), { count: 6, own: 0, failed: false });
  assert.deepEqual(resetLikeView({ count: 8, own: 0, failed: false }), { count: 6, own: 0, failed: false });
  assert.deepEqual(resetLikeView({ count: 30, own: 5, failed: true }), { count: 6, own: 0, failed: false });
  const six = { count: 6, own: 2, failed: false };
  assert.deepEqual(resetLikeView(six), six);
  const three = { count: 3, own: 1, failed: false };
  assert.deepEqual(resetLikeView(three), three);
  // 保存・通信を呼ばない: コントローラの reset は post・tracker・storage.setItem を 0 回しか呼ばない。保存は変えない（再読込で自分の個数が戻る）
  let posts = 0;
  let tracks = 0;
  const st = mem();
  st.d.set(likesKey(SID), JSON.stringify({ G1: 3 }));
  let sets = 0;
  const storage = { getItem: st.getItem, setItem: (k: string, v: string) => (sets++, st.setItem(k, v)) };
  const c = new LikeController(SID, [mk("G1", 8)], storage, () => {}, async () => (posts++, ok("G1", 9)), () => void tracks++);
  assert.equal(c.snapshot.G1.own, 3);
  c.reset("G1");
  assert.deepEqual(c.snapshot.G1, { count: 6, own: 0, failed: false });
  assert.equal(posts + tracks + sets, 0);
  assert.deepEqual(JSON.parse(st.d.get(likesKey(SID)) ?? "null"), { G1: 3 }); // 保存は変えない
  assert.equal(new LikeController(SID, [mk("G1", 8)], storage, () => {}).snapshot.G1.own, 3); // 再読込で元に戻る
  c.reset("nope"); // 無い商品は何もしない
  c.reset("G1"); // 6 では何もしない
  assert.equal(c.snapshot.G1.count, 6);
});

test("U-103 戻した後の 1 回（12A の例外・5個-16 B・5個-19 A）: ①最初の押しは 6＋1＝7 で判定し画面は 7 のまま ②次の押しは応答の合計 ③何度戻しても ④失敗・⑤上限では使い切らない ⑥失敗のあとの成功が「最初の 1 回」⑦「−」⑧再読込 ⑨別の商品は影響しない", async () => {
  const mkC = (items: SharedItem[], r: LikeResult[], st = mem()) => ctl(items, r, st).c;
  // ① 8→6 のあと最初の押し（成功。応答の合計 9）: 7 個目の演出。画面の数は 7（応答の 9 には合わせない）
  const a = mkC([mk("X", 8)], [ok("X", 9), ok("X", 10), ok("X", 11)]);
  a.reset("X");
  assert.deepEqual(a.snapshot.X, { count: 6, own: 0, failed: false });
  assert.equal(await a.add("X"), "seven");
  assert.deepEqual(a.snapshot.X, { count: 7, own: 1, failed: false });
  // ② その次の押し（応答 10）: 応答の合計で判定（ツッコミ）。画面の数は 10 に合う
  assert.equal(await a.add("X"), "tsukkomi");
  assert.deepEqual(a.snapshot.X, { count: 10, own: 2, failed: false });
  // ③ もう一度戻してから押す（応答 11）: ①と同じ
  a.reset("X");
  assert.equal(await a.add("X"), "seven");
  assert.equal(a.snapshot.X.count, 7);
  // ④ 戻した後の最初の押しが失敗: 演出なし・その 1 回は使い切らない。⑥ もう一度押して成功（応答 9）: 7 個目・画面 7
  const d = mkC([mk("X", 8)], [{ status: "error" }, ok("X", 9)]);
  d.reset("X");
  assert.equal(await d.add("X"), null);
  assert.deepEqual(d.snapshot.X, { count: 6, own: 0, failed: true });
  assert.equal(await d.add("X"), "seven");
  assert.deepEqual(d.snapshot.X, { count: 7, own: 1, failed: false });
  // ⑤ 戻した後の最初の押しが capped（応答 30）: 演出なし・画面の数は 30 に合い（5個-17 A）、使い切らない（押せなくなる）
  const e = mkC([mk("X", 8)], [ok("X", 30, true)]);
  e.reset("X");
  assert.equal(await e.add("X"), null);
  assert.deepEqual(e.snapshot.X, { count: 30, own: 0, failed: false });
  assert.equal(canAddLike(e.snapshot.X.own, e.snapshot.X.count), false);
  // ⑦ 戻した後の「−」: 自分が 0 個で隠れていて何も送らない。その 1 回は残る
  const g = ctl([mk("X", 8)], [ok("X", 9)]);
  g.c.reset("X");
  await g.c.remove("X");
  assert.deepEqual(g.calls, []);
  assert.equal(await g.c.add("X"), "seven");
  // ⑧ 戻した後、再読込（新しい LikeController）して押す: その 1 回は消え、応答の合計で判定する（画面の数はサーバーの値に戻る）
  const h = mkC([mk("X", 8)], [ok("X", 9)]);
  assert.equal(h.snapshot.X.count, 8);
  assert.equal(await h.add("X"), "tsukkomi"); // 応答 9
  assert.equal(h.snapshot.X.count, 9);
  // ⑨ X を戻した後、別の商品 Y（数 8）を押し、そのあと X を押す: Y は応答の合計で判定。X の 1 回は残る（商品ごと）
  const i = mkC([mk("X", 8), mk("Y", 8)], [ok("Y", 9), ok("X", 9)]);
  i.reset("X");
  assert.equal(await i.add("Y"), "tsukkomi");
  assert.equal(await i.add("X"), "seven");
  assert.equal(i.snapshot.X.count, 7);
  assert.equal(i.snapshot.Y.count, 9);
});

test("U-107 D-09 SP-28: 演出の判定は応答の合計だけで決まる（6・7・8・30）。2 人とも 7 を受け取れば 2 人とも 7 個目。文言は「ラッキー 7 いいね！」", async () => {
  for (const [n, want] of [[6, null], [7, "seven"], [8, "tsukkomi"], [30, "tsukkomi"]] as const) {
    assert.equal(likeEffect({ on: true, capped: false, countAfter: n }), want, String(n));
    assert.equal(shouldPlaySevenReach({ on: true, capped: false, countAfter: n }), n === 7, String(n));
    assert.equal(shouldPlayTsukkomi({ on: true, capped: false, countAfter: n }), n >= 8, String(n));
  }
  // 自分の個数は判定に使わない: 2 人目が初めて押して（自分 1 個）合計が 7 になっても出る
  const second = ctl([mk("X", 6)], [ok("X", 7)]).c;
  assert.equal(await second.add("X"), "seven");
  assert.equal(second.snapshot.X.own, 1);
  // ほぼ同時に押して、サーバーが 2 人に 7 を返した場合: 2 人とも出る（13A）
  const p = ctl([mk("X", 6)], [ok("X", 7)]).c;
  const q = ctl([mk("X", 6)], [ok("X", 7)]).c;
  const [ep, eq] = await Promise.all([p.add("X"), q.add("X")]);
  assert.deepEqual([ep, eq], ["seven", "seven"]);
  assert.equal(SEVEN_REACH.win, "ラッキー 7 いいね！");
  assert.notEqual(SEVEN_REACH.win, "7 人がいいね！");
  assert.notEqual(SEVEN_REACH.win, "7 いいね！");
  assert.equal(TSUKKOMI.line, "押しすぎやろ！");
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

test("U-104 LikeController: 応答の合計が 8 以上なら押すたびに tsukkomi（初めて押した 8 人目も）。7→seven。「−」・失敗・上限は無し。判定の数は応答の合計（12A）", async () => {
  const { c } = ctl([mk("G1", 7), mk("G2", 8), mk("G3", 29), mk("G4", 10)], [ok("G1", 8), ok("G2", 9), ok("G2", 8), ok("G2", 9), ok("G3", 30, true), { status: "error" } as LikeResult]);
  assert.equal(await c.add("G1"), "tsukkomi"); // 応答 8（自分は初めて）
  assert.equal(await c.add("G2"), "tsukkomi"); // 応答 9
  await c.remove("G2"); // 「−」は出さない
  assert.equal(await c.add("G2"), "tsukkomi"); // 押し直し（応答 9）
  assert.equal(await c.add("G3"), null); // 上限
  assert.equal(await c.add("G4"), null); // 失敗
  assert.equal(await c.add("nope"), null);
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
  // 色は globals.css の変数（NF-40）。変数の値を globals.css から読んで、設計 D-09 の 16 進の値（大文字小文字は区別しない）と比べる
  const { readFileSync: readCss } = await import("node:fs");
  const css = readCss(new URL("../app/globals.css", import.meta.url), "utf8");
  const resolve = (v: string): string => {
    const name = /^var\((--[\w-]+)\)$/.exec(v)?.[1];
    assert.ok(name, `var(--名前) の形ではない: ${v}`);
    const m = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
    assert.ok(m, `globals.css に ${name} が無い`);
    return m[1].toUpperCase();
  };
  assert.deepEqual(HARISEN.light.map(resolve), ["#FFFFFF", "#FBF5E6", "#E9DDBF"]);
  assert.deepEqual(HARISEN.shade.map(resolve), ["#E9DCBA", "#D8C59A", "#BFA977"]);
  assert.equal(resolve(HARISEN.grip.color), "#D7261E");
  assert.equal(resolve(HARISEN.edge.color), "#2A2220");
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
  assert.equal(await c.add("G1"), "seven"); // ④ 6＋1＝7（応答の 9 は使わない）
  assert.equal(c.snapshot.G1.count, 7);
  assert.deepEqual(log, ["post:G1:true", "track:8"]);
  c.reset("G1"); // ⑤ もう一度戻して押す
  assert.equal(await c.add("G1"), "seven");
  assert.deepEqual((log as string[]).filter((x) => x.startsWith("post")), ["post:G1:true", "post:G1:true"]); // 常に on＝true の通常の押し
});

test("I-70 戻しはサーバーの数に触れない: 戻した後の POST は on＝true だけ。上限（capped）の商品は戻しても 7 にならず演出なし（数は応答の 30 に合う）。再読込で数はサーバーの値に戻りボタンがまた出る", async () => {
  const log: Array<[string, boolean]> = [];
  const mkC = (items: SharedItem[], r: LikeResult[]) => new LikeController(SID, items, mem(), () => {}, async (_s, id, on) => (log.push([id, on]), r.shift() as LikeResult), () => {});
  const c = mkC([mk("G1", 8), mk("G2", 30)], [ok("G2", 30, true)]);
  c.reset("G1");
  c.reset("G2");
  assert.deepEqual(log, []); // ① 戻しは POST を送らない（サーバーの数は 8・30 のまま）
  assert.equal(await c.add("G2"), null); // ③ 上限: 演出なし
  assert.equal(c.snapshot.G2.count, 30); // 数は応答の合計に合う（5個-17 A）
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
    const c = new LikeController(SID, items, mem(), (v) => log.push(`view:${Object.values(v).map((x) => `${x.count}${x.own ? "L" : ""}${x.failed ? "F" : ""}`).join(",")}`), async () => (posts++, post()), (step) => void log.push(`track:${step}`));
    return { c, posts: () => posts };
  };
  const a = mkC([mk("G1", 7)], () => new Promise<LikeResult>((r) => (release = r))); // ① 応答を 2 秒遅らせる想定
  const p = a.c.add("G1");
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
    assert.equal(await b.c.add("G1"), null);
    assert.ok(!(log as string[]).includes("track:8"));
  }
  // ⑥ 別の商品が 8 になる ⑦ 「−」では出ない
  const d = mkC([mk("G1", 7), mk("G2", 7)], async () => ok("x", 8));
  assert.equal(await d.c.add("G1"), "tsukkomi");
  assert.equal(await d.c.add("G2"), "tsukkomi");
  const before = log.length;
  await d.c.remove("G1"); // 「−」: 段 8 も演出も無い
  assert.ok(!(log as string[]).slice(before).includes("track:8"));
});

test("I-72 8 個目以上でも API は変わらない: 押しは on＝true の 1 項目だけ。応答の項目（product_id・like_count・capped）以外を画面は使わない。段 8 は押しのたびに 1 回で、演出の有無で変わらない", async () => {
  const calls: Array<[string, string, boolean]> = [];
  let tracks = 0;
  const c = new LikeController(SID, [mk("G1", 7)], mem(), () => {}, async (s, id, on) => (calls.push([s, id, on]), ok(id, 8 + calls.length)), () => void tracks++);
  assert.equal(await c.add("G1"), "tsukkomi"); // ①
  await c.remove("G1"); // 「−」
  assert.equal(await c.add("G1"), "tsukkomi"); // ②
  assert.deepEqual(calls, [[SID, "G1", true], [SID, "G1", false], [SID, "G1", true]]);
  assert.equal(tracks, 2); // 「−」は送らない
  const { readFileSync } = await import("node:fs");
  const api = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
  assert.doesNotMatch(api, /tsukkomi|harisen|reset/i); // API の層に新しい項目・呼び出しを足していない
});

test("U-102 応答待ちの間の「6 個に戻す」は何もしない（数を変えない）。応答後は押した分だけ増える", async () => {
  let release: (r: LikeResult) => void = () => {};
  const views: number[] = [];
  const c = new LikeController(SID, [mk("G1", 7), mk("G2", 8)], mem(), (v) => views.push(v.G1.count), () => new Promise<LikeResult>((r) => (release = r)), () => {});
  const p = c.add("G1"); // 7 で押す（応答待ち）
  c.reset("G1"); // 待つ間に戻す → 何もしない
  assert.equal(c.snapshot.G1.count, 7);
  assert.deepEqual(views, []);
  c.reset("G2"); // 別の商品は応答待ちではないので戻る
  assert.equal(c.snapshot.G2.count, 6);
  release(ok("G1", 8));
  assert.equal(await p, "tsukkomi"); // 7＋1＝8
  assert.equal(c.snapshot.G1.count, 8);
  c.reset("G1"); // 応答後は戻せる
  assert.equal(c.snapshot.G1.count, 6);
});

// ---- I-53（SP-28・N-17・5個-10 A・5個-17 A）画面側: 偽のサーバー（合計上限 30）に、5 個ずつ押すブラウザを重ねる ----
test("I-53 6 つのブラウザが 5 個ずつ（合計 30）押したあと、7 つ目のブラウザの押しは capped: 自分の個数は増えず、数は 30 に合い、「いいね」は押せず「いいねは30個までです」。自分が 0 個なら「−」は隠れて取り消しを送らない。ほかの商品の数は増えない", async () => {
  const server: Record<string, number> = { X: 0, Y: 0 };
  const sent: Array<[string, boolean]> = [];
  const post = async (_s: string, id: string, on: boolean): Promise<LikeResult> => {
    sent.push([id, on]);
    if (on && server[id] >= 30) return ok(id, 30, true); // D-39: 200 のまま capped＝true
    server[id] += on ? 1 : -1;
    return ok(id, server[id]);
  };
  const browser = () => new LikeController(SID, [mk("X", server.X), mk("Y", server.Y)], mem(), () => {}, post, () => {});
  for (let b = 0; b < 6; b++) {
    const c = browser();
    for (let i = 0; i < 5; i++) await c.add("X");
    assert.equal(c.snapshot.X.own, 5);
  }
  assert.equal(server.X, 30);
  const seventh = browser(); // 開いたときに数 30
  assert.equal(seventh.snapshot.X.count, 30);
  assert.equal(canAddLike(seventh.snapshot.X.own, seventh.snapshot.X.count), false); // 開いた時点で押せない
  assert.equal(likeLimitMessage(seventh.snapshot.X.own, seventh.snapshot.X.count), "いいねは30個までです");
  // 開いたあとに 30 に届いた場合（画面の数は古いまま）: 押すと capped
  const late = new LikeController(SID, [mk("X", 29), mk("Y", server.Y)], mem(), () => {}, post, () => {});
  const before = sent.length;
  assert.equal(await late.add("X"), null);
  assert.equal(sent.length, before + 1);
  assert.deepEqual(late.snapshot.X, { count: 30, own: 0, failed: false }); // 自分の個数は増えず、数は応答の合計（30）
  assert.equal(canAddLike(late.snapshot.X.own, late.snapshot.X.count), false);
  assert.equal(canRemoveLike(late.snapshot.X.own), false); // 自分が 0 個: 「−」は隠れている
  await late.remove("X");
  assert.equal(sent.length, before + 1); // 取り消しを送らない
  assert.equal(server.X, 30);
  assert.equal(server.Y, 0); // ほかの商品の数は増えない
  assert.equal(late.snapshot.Y.count, 0);
});
