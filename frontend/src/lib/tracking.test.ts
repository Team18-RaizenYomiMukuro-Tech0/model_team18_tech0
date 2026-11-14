import test from "node:test";
import assert from "node:assert/strict";
import {
  ID_RE, VISIT_GAP_MS, VISIT_KEY, VISITOR_KEY, TEST_KEY_STORE, buildEventBody, captureTestKey, randomId, readTestKey, sendEvent, touchVisit, track,
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
  for (const step of [4, 5, 6] as const) assert.deepEqual(Object.keys(buildEventBody(ids, step, { scene: "お礼", entry: "top", has_voice: true })).sort(), ["step", "visit_id", "visitor_id"]);
  assert.deepEqual(buildEventBody(ids, 7, { zero_cond: "both", scene: "お礼" }), { visit_id: ids.visitId, visitor_id: ids.visitorId, step: 7, zero_cond: "both" });
  const all = JSON.stringify([1, 2, 3, 4, 5, 6, 7].map((s) => buildEventBody(ids, s as 1, { scene: "お礼", has_voice: true, entry: "top", zero_cond: "price" })));
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
  assert.equal(track(2, { scene: "お礼" }, { local, session, now: T0, random: rand, send: (b) => sent.push(b) }), true);
  assert.equal(sent[0]!.step, 2);
  assert.equal(sent[0]!.scene, "お礼");
  assert.equal(sent[0]!.test_key, "key1");
  assert.equal(track(2, {}, { local: null, session, now: T0, send: (b) => sent.push(b) }), false);
  assert.equal(sent.length, 1);
  assert.ok(!("test_key" in (track(1, { entry: "top" }, { local, session: null, now: T0 + 1, send: (b) => sent.push(b) }) ? sent[1]! : {})));
});
