import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { REQUEST_TIMEOUT_MS, SHARE_FAILED_MESSAGE, ShareLinkRunner, shareFullUrl, shareRequestBody, type ShareState } from "./api.ts";
import { canCreate } from "./selection.ts";

// S-10〜S-13 S-39 S-40 S-51 E-04 E-05: 共有リンクの作成。API を偽物に差し替え、偽のタイマーで応答を遅らせる／失敗させる
type Res = { ok: boolean; json: () => Promise<unknown> };
type Init = { method: "POST"; headers: Record<string, string>; body: string; signal: AbortSignal };
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};
const link = (n: number) => ({ share_id: `id${n}`, path: `/s/id${n}`, created_at: "2026-11-13T00:00:00Z", expires_at: "2026-12-13T00:00:00Z" });

// 偽の API: 呼ばれた回数と本文を記録する。replies の順に応答する（delay ミリ秒後。ok=false は失敗）
function setup(replies: { delay?: number; ok?: boolean; body?: unknown }[]) {
  mock.timers.enable({ apis: ["setTimeout"] });
  const calls: { url: string; init: Init }[] = [];
  const states: ShareState[] = [];
  const runner = new ShareLinkRunner(
    (s) => states.push(s),
    (url, init) => {
      const n = calls.push({ url, init }) - 1;
      const r = replies[n] ?? replies[replies.length - 1];
      return new Promise<Res>((resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(new Error("aborted")));
        setTimeout(() => resolve({ ok: r.ok ?? true, json: async () => r.body ?? link(n + 1) }), r.delay ?? 0);
      });
    },
  );
  return { runner, calls, states, last: () => states[states.length - 1] };
}
const pick = (...ids: string[]) => ids;

test("shareLink S-10: 作成中 → 成功になり、リンクが入る。作成後はボタンがまた押せる", async () => {
  const { runner, states, last } = setup([{ delay: 100 }]);
  runner.create(pick("G0001"));
  assert.equal(last().status, "creating");
  mock.timers.tick(100);
  await flush();
  assert.deepEqual(states.map((s) => s.status), ["creating", "success"]);
  assert.equal(last().link?.path, "/s/id1");
  assert.equal(canCreate(1, last().status === "creating"), true);
  mock.timers.reset();
});

test("shareLink S-11: 選択 0 件ではボタンを押せない（canCreate が false）", () => {
  assert.equal(canCreate(0), false);
});

test("shareLink S-12: 作成中に押しても API は1回だけ。作成中は canCreate が false", async () => {
  const { runner, calls, last } = setup([{ delay: 3000 }]);
  runner.create(pick("G0001"));
  assert.equal(canCreate(1, last().status === "creating"), false);
  runner.create(pick("G0001"));
  runner.create(pick("G0001"));
  mock.timers.tick(3000);
  await flush();
  assert.equal(calls.length, 1);
  assert.equal(last().status, "success");
  mock.timers.reset();
});

test("shareLink S-39 S-13 #41-1: 作り直すと新しいリンクに置き換わる。作成中・失敗の間も前のリンクは残る", async () => {
  const { runner, last } = setup([{}, { delay: 500 }]);
  runner.create(pick("G0001"));
  mock.timers.tick(0);
  await flush();
  assert.equal(last().link?.share_id, "id1");
  runner.create(pick("G0002"));
  assert.equal(last().status, "creating");
  assert.equal(last().link?.share_id, "id1"); // 作り直している間も L1 が残る
  mock.timers.tick(500);
  await flush();
  assert.equal(last().status, "success");
  assert.equal(last().link?.share_id, "id2"); // 最新の1本だけ
  mock.timers.reset();
});

test("shareLink S-40 E-04 E-05: 失敗 → 同じ選択で再試行すると1件だけ作られ、失敗が消える", async () => {
  const { runner, calls, last } = setup([{ ok: false }, {}]);
  const ids = pick("G0003", "G0001", "G0002");
  runner.create(ids);
  mock.timers.tick(0);
  await flush();
  assert.equal(last().status, "error");
  assert.equal(SHARE_FAILED_MESSAGE, "失敗しました。もう一度お試しください");
  runner.create(ids); // 再試行
  mock.timers.tick(0);
  await flush();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].init.body, calls[0].init.body); // 同じ選択でやり直す
  assert.equal(last().status, "success");
  mock.timers.reset();
});

test("shareLink E-04: 10秒で打ち切って失敗にし、遅れて届いた応答は捨てる", async () => {
  const { runner, last } = setup([{ delay: REQUEST_TIMEOUT_MS + 5000 }]);
  runner.create(pick("G0001"));
  mock.timers.tick(REQUEST_TIMEOUT_MS);
  await flush();
  assert.equal(last().status, "error");
  mock.timers.tick(10000);
  await flush();
  assert.equal(last().status, "error");
  mock.timers.reset();
});

test("shareLink E-04: 形の違う応答は失敗にする", async () => {
  const { runner, last } = setup([{ body: { nothing: 1 } }]);
  runner.create(pick("G0001"));
  mock.timers.tick(0);
  await flush();
  assert.equal(last().status, "error");
  mock.timers.reset();
});

test("shareLink S-51 #41-7: 3位・1位・2位・再検索後の D の順に選ぶと、その順の商品IDだけを送る", async () => {
  const { runner, calls } = setup([{}]);
  const order = pick("G0003", "G0001", "G0002", "G0099");
  runner.create(order);
  assert.equal(calls[0].init.method, "POST");
  assert.ok(calls[0].url.endsWith("/api/share-links"));
  assert.deepEqual(JSON.parse(calls[0].init.body), { product_ids: order });
  assert.equal(shareRequestBody(order), JSON.stringify({ product_ids: order }));
  mock.timers.tick(0);
  await flush();
  mock.timers.reset();
});

test("shareLink #65: リンクの全体の URL は、いま開いているサイトの送信元に path をつなぐ", () => {
  assert.equal(shareFullUrl("https://giftia.azurewebsites.net", "/s/abc"), "https://giftia.azurewebsites.net/s/abc");
  assert.equal(shareFullUrl("https://giftia.azurewebsites.net/", "/s/abc"), "https://giftia.azurewebsites.net/s/abc");
});
