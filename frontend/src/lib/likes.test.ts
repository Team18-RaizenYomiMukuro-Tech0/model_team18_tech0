import test from "node:test";
import assert from "node:assert/strict";
import { likeBody, likeUrl, postLike } from "./api.ts";

// D-39 SP-28: いいねの呼び出し（POST /api/share-links/{share_id}/likes）
const SID = "A".repeat(22);
const r = (status: number, body: unknown) => async () => ({ status, ok: status < 400, json: async () => body }) as unknown as Response;

test("likes D-39: URL と本文（product_id と on だけ。名前・メール・IP を送らない）", () => {
  assert.equal(likeUrl(SID), `/api/share-links/${SID}/likes`);
  assert.deepEqual(JSON.parse(likeBody("G0001", true)), { product_id: "G0001", on: true });
  assert.deepEqual(JSON.parse(likeBody("G0001", false)), { product_id: "G0001", on: false });
});
test("likes D-39: 成功は {product_id, like_count, capped}。capped:true も成功として返す（画面は印を付けない。R3）", async () => {
  assert.deepEqual(await postLike(SID, "G0001", true, undefined, r(200, { product_id: "G0001", like_count: 3, capped: false })), {
    status: "ok", product_id: "G0001", like_count: 3, capped: false,
  });
  const capped = await postLike(SID, "G0001", true, undefined, r(200, { product_id: "G0001", like_count: 30, capped: true }));
  assert.deepEqual(capped, { status: "ok", product_id: "G0001", like_count: 30, capped: true });
});
test("likes D-39: 404 は notfound、410 は expired、422・500・通信失敗・形の違う応答は error", async () => {
  assert.equal((await postLike(SID, "G0001", true, undefined, r(404, {}))).status, "notfound");
  assert.equal((await postLike(SID, "G0001", true, undefined, r(410, {}))).status, "expired");
  assert.equal((await postLike(SID, "G0001", true, undefined, r(422, {}))).status, "error");
  assert.equal((await postLike(SID, "G0001", true, undefined, r(500, {}))).status, "error");
  assert.equal((await postLike(SID, "G0001", true, undefined, r(200, { like_count: "3" }))).status, "error");
  assert.equal((await postLike(SID, "G0001", true, undefined, async () => { throw new Error("net"); })).status, "error");
});
test("likes: POST・JSON で送る", async () => {
  let seen: { url: string; init: RequestInit } | null = null;
  await postLike(SID, "G0002", false, undefined, (async (url: string, init: RequestInit) => {
    seen = { url, init };
    return { status: 200, ok: true, json: async () => ({ product_id: "G0002", like_count: 0, capped: false }) };
  }) as unknown as typeof fetch);
  assert.equal(seen!.init.method, "POST");
  assert.deepEqual(seen!.init.headers, { "Content-Type": "application/json" });
  assert.deepEqual(JSON.parse(String(seen!.init.body)), { product_id: "G0002", on: false });
});
