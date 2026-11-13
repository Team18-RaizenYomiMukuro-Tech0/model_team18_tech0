import test from "node:test";
import assert from "node:assert/strict";
import { fetchShared, itemNote, sharedUrl } from "./sharedLink.ts";

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
