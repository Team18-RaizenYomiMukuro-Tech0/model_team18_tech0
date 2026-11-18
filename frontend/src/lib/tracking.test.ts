import test from "node:test";
import assert from "node:assert/strict";
import {
  ID_RE, VISIT_GAP_MS, noteDetailOpened, shareIdOf, VISIT_KEY, VISITOR_KEY, TEST_KEY_STORE, buildEventBody, captureTestKey, randomId, readTestKey, sendEvent, touchVisit, track,
  type StorageLike,
} from "./tracking.ts";

function mem(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}
let seed = 0;
const rand = (n: number) => Uint8Array.from({ length: n }, (_, i) => (seed++ * 31 + i * 7) % 256);
const T0 = Date.UTC(2026, 10, 15, 0, 0, 0);

test("randomId は 22文字の [A-Za-z0-9_-]（base64url、= なし）", () => {
  for (let i = 0; i < 20; i++) assert.match(randomId(rand), ID_RE);
  assert.match(randomId(), ID_RE);
  assert.notEqual(randomId(), randomId());
});

test("U-79 訪問の区切り: 29分59秒後は同じ訪問、30分0秒・30分1秒後は新しい訪問。訪問者 ID はずっと同じ", () => {
  const s = mem();
  const a = touchVisit(s, T0, rand)!;
  const b = touchVisit(s, T0 + 29 * 60000 + 59000, rand)!; // 29:59 後 → 同じ
  assert.equal(b.visitId, a.visitId);
  const c = touchVisit(s, T0 + 29 * 60000 + 59000 + VISIT_GAP_MS, rand)!; // 前の記録から ちょうど30分0秒 → 新しい
  assert.notEqual(c.visitId, b.visitId);
  const d = touchVisit(s, T0 + 29 * 60000 + 59000 + VISIT_GAP_MS + 30 * 60000 + 1000, rand)!; // 30分1秒 → 新しい
  assert.notEqual(d.visitId, c.visitId);
  assert.equal(a.visitorId, b.visitorId);
  assert.equal(a.visitorId, c.visitorId);
  assert.equal(a.visitorId, d.visitorId);
  assert.match(a.visitorId, ID_RE);
});

test("前の記録から数える: 29分ごとに記録していれば、最初から1時間たっても同じ訪問", () => {
  const s = mem();
  const a = touchVisit(s, T0, rand)!;
  const b = touchVisit(s, T0 + 29 * 60000, rand)!;
  const c = touchVisit(s, T0 + 58 * 60000, rand)!;
  assert.equal(c.visitId, a.visitId);
  assert.equal(b.visitId, a.visitId);
});

test("保存が壊れた・使えないとき: 壊れた値は作り直し、使えなければ null（送らない。S-116）", () => {
  const s = mem();
  s.data.set(VISIT_KEY, "not json");
  s.data.set(VISITOR_KEY, "short");
  const ids = touchVisit(s, T0, rand)!;
  assert.match(ids.visitId, ID_RE);
  assert.match(ids.visitorId, ID_RE);
  assert.equal(touchVisit(null, T0, rand), null);
  const broken: StorageLike = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); }, removeItem: () => {} };
  assert.equal(touchVisit(broken, T0, rand), null);
});

const ids = { visitId: "A".repeat(22), visitorId: "B".repeat(22) };

test("U-81 本文: 段ごとに入る項目だけ。名前・メール・IP・ブラウザの情報・商品ID・検索語・is_test が無い", () => {
  assert.deepEqual(buildEventBody(ids, 1, { entry: "top", scene: "お礼", has_voice: true, zero_cond: "price" }), { visit_id: ids.visitId, visitor_id: ids.visitorId, step: 1, entry: "top" });
  assert.deepEqual(buildEventBody(ids, 2, { scene: "送別", entry: "top" }), { visit_id: ids.visitId, visitor_id: ids.visitorId, step: 2, scene: "送別" });
  assert.deepEqual(buildEventBody(ids, 3, { scene: "誕生日", has_voice: false }), { visit_id: ids.visitId, visitor_id: ids.visitorId, step: 3, scene: "誕生日", has_voice: 0 });
  for (const step of [4, 6] as const) assert.deepEqual(Object.keys(buildEventBody(ids, step, { scene: "お礼", entry: "top", has_voice: true })).sort(), ["step", "visit_id", "visitor_id"]);
  assert.deepEqual(buildEventBody(ids, 5, { scene: "お礼", entry: "top" }), { visit_id: ids.visitId, visitor_id: ids.visitorId, step: 5, detail_count: 0 }); // 開いた詳細が無ければ 0（NULL ではない）
  assert.deepEqual(buildEventBody(ids, 7, { zero_cond: "both", scene: "お礼" }), { visit_id: ids.visitId, visitor_id: ids.visitorId, step: 7, zero_cond: "both" });
  const all = JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8].map((s) => buildEventBody(ids, s as 1, { scene: "お礼", has_voice: true, entry: "top", zero_cond: "price" })));
  for (const bad of ["is_test", "product", "query", "name", "mail", "ip", "user"]) assert.ok(!all.includes(`"${bad}`), bad);
});

test("U-81 has_voice は 0／1（真偽値ではない）。声が 1 件以上なら 1", () => {
  assert.equal(buildEventBody(ids, 3, { has_voice: true }).has_voice, 1);
  assert.equal(buildEventBody(ids, 3, { has_voice: false }).has_voice, 0);
  assert.ok(!("has_voice" in buildEventBody(ids, 3, {}))); // 無ければ送らない
});

test("U-81 test_key はテストの訪問のときだけ（通常の本文に無い）。64文字まで", () => {
  assert.ok(!("test_key" in buildEventBody(ids, 1, { entry: "top" })));
  assert.equal(buildEventBody(ids, 1, { entry: "top" }, "secret").test_key, "secret");
  assert.equal(String(buildEventBody(ids, 1, {}, "x".repeat(80)).test_key).length, 64);
});

test("K-5 giftia_test: URL の目印を sessionStorage に入れ、URL から取り除く。off で消す。保存できなくても壊れない", () => {
  const ses = mem();
  assert.deepEqual(captureTestKey("?giftia_test=abc&scene=お礼", ses), { cleaned: "?scene=%E3%81%8A%E7%A4%BC" });
  assert.equal(ses.data.get(TEST_KEY_STORE), "abc");
  assert.equal(readTestKey(ses), "abc");
  assert.deepEqual(captureTestKey("?giftia_test=xyz", ses), { cleaned: "" });
  assert.equal(readTestKey(ses), "xyz");
  assert.deepEqual(captureTestKey("?scene=お礼", ses), { cleaned: null }); // 目印なしはそのまま・保存も変えない
  assert.equal(readTestKey(ses), "xyz");
  captureTestKey("?giftia_test=off", ses);
  assert.equal(readTestKey(ses), null);
  captureTestKey("?giftia_test=" + "x".repeat(65), ses); // 長すぎる値は保存しない
  assert.equal(readTestKey(ses), null);
  const broken: StorageLike = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); }, removeItem: () => { throw new Error("denied"); } };
  assert.deepEqual(captureTestKey("?giftia_test=abc", broken), { cleaned: "" });
  assert.equal(readTestKey(broken), null);
  assert.equal(readTestKey(null), null);
});

test("sendEvent: POST /api/events を keepalive で送り、失敗（同期・非同期）でも何も投げない。個人の情報を本文に足さない", async () => {
  const calls: { url: string; init: { method: string; keepalive: boolean; headers: Record<string, string>; body: string } }[] = [];
  sendEvent({ step: 1 }, (url, init) => { calls.push({ url, init }); return Promise.reject(new Error("net")); });
  await new Promise((r) => setTimeout(r, 5)); // 未処理の拒否にならない
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.url, /\/api\/events$/);
  assert.equal(calls[0]!.init.method, "POST");
  assert.equal(calls[0]!.init.keepalive, true);
  assert.equal(calls[0]!.init.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(calls[0]!.init.body), { step: 1 });
  assert.doesNotThrow(() => sendEvent({ step: 1 }, () => { throw new Error("sync"); }));
});

test("track: 保存が使えれば本文を作って送る。使えなければ送らず false（S-116）。test_key は sessionStorage から", () => {
  const sent: Record<string, unknown>[] = [];
  const local = mem();
  const session = mem();
  session.data.set(TEST_KEY_STORE, "key1");
  track(1, { entry: "top" }, { local, session, now: T0 - 1, random: rand, send: () => undefined }); // 訪問を先に作っておく（新しい訪問の ① を足させない）
  assert.equal(track(2, { scene: "お礼" }, { local, session, now: T0, random: rand, send: (b) => sent.push(b) }), true);
  assert.equal(sent[0]!.step, 2);
  assert.equal(sent[0]!.scene, "お礼");
  assert.equal(sent[0]!.test_key, "key1");
  assert.equal(track(2, {}, { local: null, session, now: T0, send: (b) => sent.push(b) }), false);
  assert.equal(sent.length, 1);
  assert.ok(!("test_key" in (track(1, { entry: "top" }, { local, session: null, now: T0 + 1, send: (b) => sent.push(b) }) ? sent[1]! : {})));
});

// ---- 共有リンクの輪の計測（11/18。ADR-017）U-81 直した版・U-93・U-94・U-95 の画面側 ----
const L1 = "L".repeat(22);
const L2 = "M".repeat(22);
const L3 = "N".repeat(22);
const shareLoc = (id: string) => ({ pathname: `/s/${id}`, search: "" });
const topLoc = { pathname: "/", search: "" };
const bodies = () => {
  const sent: Record<string, unknown>[] = [];
  return { sent, send: (b: Record<string, unknown>) => void sent.push(b) };
};

test("U-81 share_id・detail_count: 段1〜4・6 は訪問の値、段5 は作ったリンクと数、段8 は押したページ、段7 は入らない。detail_count は段5だけ", () => {
  const v = { ...ids, shareId: L1, detailCount: 2 };
  for (const step of [1, 2, 3, 4, 6] as const) {
    const b = buildEventBody(v, step, { share_id: L2 });
    assert.equal(b.share_id, L1, `段${step}`); // 呼び出し側の値では上書きできない
    assert.ok(!("detail_count" in b));
  }
  assert.ok(!("share_id" in buildEventBody(v, 7, { zero_cond: "price", share_id: L2 })));
  const five = buildEventBody(v, 5, { share_id: L2 });
  assert.equal(five.share_id, L2);
  assert.equal(five.detail_count, 2);
  const eight = buildEventBody({ ...ids, detailCount: 3 }, 8, { share_id: L3, scene: "お礼", entry: "top", zero_cond: "both" });
  assert.deepEqual(eight, { visit_id: ids.visitId, visitor_id: ids.visitorId, step: 8, share_id: L3 }); // 訪問に share_id が無くても押したページの値
  assert.ok(!("share_id" in buildEventBody(ids, 1, { entry: "top" }))); // 共有ページ以外から始まった訪問は NULL
  assert.ok(!("share_id" in buildEventBody(ids, 5, {}))); // 作ったリンクの値が無ければ入れない
  assert.ok(!("share_id" in buildEventBody(ids, 8, { share_id: "short" }))); // 形の違う値は本文に作らない
});

test("U-93 ① 最初のページが /s/{22文字}: 訪問の share_id がその値。段1〜4・6 に入り、段7 に入らない", () => {
  const s = mem();
  const { sent, send } = bodies();
  assert.equal(track(1, { entry: "share" }, { local: s, session: mem(), now: T0, random: rand, send, loc: shareLoc(L1) }), true);
  for (const step of [2, 3, 4, 6] as const) track(step, {}, { local: s, session: mem(), now: T0 + 1000, random: rand, send, loc: topLoc });
  track(7, { zero_cond: "price" }, { local: s, session: mem(), now: T0 + 2000, random: rand, send, loc: topLoc });
  for (const b of sent.filter((x) => x.step !== 7)) assert.equal(b.share_id, L1, `段${String(b.step)}`);
  assert.ok(!("share_id" in sent.find((x) => x.step === 7)!));
  assert.equal(sent.length, 6); // 段 1・2・3・4・6・7（新しい訪問の ① は 1 回だけ）
});

test("U-93 ② トップから始まり、その後 /s/ を開く: 段1〜4・6 に share_id は入らない（輪-2）", () => {
  const s = mem();
  const { sent, send } = bodies();
  track(1, { entry: "top" }, { local: s, session: mem(), now: T0, random: rand, send, loc: topLoc });
  for (const step of [2, 3, 4, 6] as const) track(step, {}, { local: s, session: mem(), now: T0 + 1000, random: rand, send, loc: shareLoc(L1) });
  assert.ok(sent.every((b) => !("share_id" in b)));
});

test("U-93 ③ 共有ページから始まり、途中で別の共有ページ: 最初の値のまま（輪-7）", () => {
  const s = mem();
  const { sent, send } = bodies();
  track(1, { entry: "share" }, { local: s, session: mem(), now: T0, random: rand, send, loc: shareLoc(L1) });
  track(3, {}, { local: s, session: mem(), now: T0 + 1000, random: rand, send, loc: shareLoc(L2) });
  assert.deepEqual(sent.map((b) => b.share_id), [L1, L1]);
});

test("U-93 ④ 29分59秒後は同じ値。30分0秒後にトップで操作すると新しい訪問で、持たない", () => {
  const s = mem();
  const a = touchVisit(s, T0, rand, `/s/${L1}`)!;
  const b = touchVisit(s, T0 + 29 * 60000 + 59000, rand, "/")!;
  assert.equal(b.visitId, a.visitId);
  assert.equal(b.shareId, L1);
  const c = touchVisit(s, T0 + 29 * 60000 + 59000 + VISIT_GAP_MS, rand, "/")!;
  assert.notEqual(c.visitId, b.visitId);
  assert.equal(c.shareId, undefined);
});

test("U-93 ⑤ 30分あいた後、別の共有ページで操作: 新しい訪問の share_id がそのとき開いているページの値（輪-7）。① も同じ値で 1 回送る", () => {
  const s = mem();
  const { sent, send } = bodies();
  track(1, { entry: "share" }, { local: s, session: mem(), now: T0, random: rand, send, loc: shareLoc(L1) });
  sent.length = 0;
  track(4, {}, { local: s, session: mem(), now: T0 + VISIT_GAP_MS, random: rand, send, loc: shareLoc(L2) });
  assert.deepEqual(sent.map((b) => [b.step, b.share_id]), [[1, L2], [4, L2]]);
  assert.equal(sent[0]!.entry, "share");
});

test("U-93 ⑥ 最初が /s/ ＋ 21文字（形が違う）: 入らない。段1 の entry は share。⑦ 保存が使えないと送信しない", () => {
  const s = mem();
  const { sent, send } = bodies();
  track(1, { entry: "share" }, { local: s, session: mem(), now: T0, random: rand, send, loc: { pathname: `/s/${"L".repeat(21)}`, search: "" } });
  assert.ok(!("share_id" in sent[0]!));
  assert.equal(sent[0]!.entry, "share");
  assert.equal(track(1, { entry: "share" }, { local: null, session: mem(), send, loc: shareLoc(L1) }), false);
  assert.equal(sent.length, 1);
  // パスだけから読む（クエリ・ハッシュ・長すぎるパスは含めない）
  assert.equal(shareIdOf(`/s/${L1}`), L1);
  assert.equal(shareIdOf(`/s/${L1}/`), L1);
  assert.equal(shareIdOf(`/s/${L1}x`), null);
  assert.equal(shareIdOf(`/s/${L1}?x=1`), null);
  assert.equal(shareIdOf("/search"), null);
});

test("U-94 開いた詳細の数: A・A・B・(404 は呼ばない) → ⑤ の detail_count＝2。新しい訪問で 0 から。開かなければ 0。商品 ID はどの本文にも入らない", () => {
  const s = mem();
  const { sent, send } = bodies();
  const d = { local: s, session: mem(), random: rand, send, loc: topLoc };
  assert.equal(noteDetailOpened("G0001", { ...d, now: T0 }), true); // 新しい訪問を作るので ① だけ送る
  noteDetailOpened("G0001", { ...d, now: T0 + 1000 }); // 重複
  noteDetailOpened("G0002", { ...d, now: T0 + 2000 });
  // 404・失敗の商品は noteDetailOpened を呼ばない（呼び出し元 DetailPanel は okId のときだけ）
  track(5, { share_id: L2 }, { ...d, now: T0 + 3000 });
  const five = sent.find((b) => b.step === 5)!;
  assert.equal(five.detail_count, 2);
  assert.equal(five.share_id, L2);
  // 30 分あけた新しい訪問では 0 から数え直す
  track(5, { share_id: L3 }, { ...d, now: T0 + 3000 + VISIT_GAP_MS });
  assert.equal(sent.filter((b) => b.step === 5)[1]!.detail_count, 0);
  noteDetailOpened("G0009", { ...d, now: T0 + 3000 + VISIT_GAP_MS + 1000 });
  noteDetailOpened("G0009", { ...d, now: T0 + 3000 + VISIT_GAP_MS + 2000 });
  // 全部の段の本文を作る: detail_count は段5だけ。商品 ID・一覧は無い
  const all: Record<string, unknown>[] = [];
  const s2 = mem();
  noteDetailOpened("G0100", { local: s2, session: mem(), random: rand, send: () => {}, loc: topLoc, now: T0 });
  for (const step of [1, 2, 3, 4, 5, 6, 7, 8] as const) track(step, { share_id: L1, zero_cond: "price" }, { local: s2, session: mem(), random: rand, send: (b) => void all.push(b), loc: topLoc, now: T0 + 10 });
  assert.deepEqual(all.filter((b) => "detail_count" in b).map((b) => b.step), [5]);
  const text = JSON.stringify([...sent, ...all]);
  for (const bad of ["G0001", "G0002", "G0009", "G0100", "opened", "product"]) assert.ok(!text.includes(bad), bad);
  // 一覧はブラウザの保存の中にだけある
  assert.ok(s.data.get(VISIT_KEY)!.includes("opened"));
});

test("U-94 詳細を一度も開かずに ⑤ → detail_count＝0。保存が使えないと何も記録しない（S-116）", () => {
  const { sent, send } = bodies();
  track(5, { share_id: L2 }, { local: mem(), session: mem(), random: rand, send, loc: topLoc, now: T0 });
  assert.equal(sent.find((b) => b.step === 5)!.detail_count, 0);
  assert.equal(noteDetailOpened("G0001", { local: null, send, loc: topLoc }), false);
});

test("U-94 壊れた opened は空として扱う。訪問の保存に share_id が壊れて入っていても本文に出さない", () => {
  const s = mem();
  s.data.set(VISIT_KEY, JSON.stringify({ visit_id: "A".repeat(22), last_at: T0, share_id: "bad", opened: [1, "G1", null] }));
  const v = touchVisit(s, T0 + 1000, rand, "/")!;
  assert.equal(v.shareId, undefined);
  assert.equal(v.detailCount, 1);
});
