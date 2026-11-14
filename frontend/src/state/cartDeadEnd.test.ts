import test from "node:test";
import assert from "node:assert/strict";
import { arrivesText } from "../lib/arrival.ts";
import { buyableCount, continueTarget, NO_BUYABLE_MESSAGE, orderGate, pressOrder, rowHasProduct, type CartFound } from "./cartCheck.ts";
import { ORDER_DEMO_MESSAGE } from "./cart.ts";
import type { EventExtra, EventStep } from "../lib/tracking.ts";

// S-78 F-26 SP-18 ③（カートの行き止まり）・S-99 F-44 SP-26（行の届く日）・SP-34 ⑥（注文へ進む）。画面の外の判定を試す（画面は PR のスクリーンショット）
const ok = (stock: "available" | "out_of_stock", extra: Partial<CartFound> = {}): CartFound => ({ status: "ok", price: 1000, stock, name: "品", ...extra });
const gone: CartFound = { status: "notfound" };
const bad: CartFound = { status: "error" };

test("S-78 ① 販売終了・在庫なし・読めない・確認中だけのカートは「注文へ進む」を押せず、買える商品がありませんと出す", () => {
  const ids = ["G1", "G2", "G3", "G4"];
  const found = { G1: gone, G2: ok("out_of_stock"), G3: bad }; // G4 はまだ確かめていない
  assert.equal(buyableCount(ids, found), 0);
  assert.deepEqual(orderGate(ids, found), { canOrder: false, hint: NO_BUYABLE_MESSAGE });
  assert.equal(NO_BUYABLE_MESSAGE, "買える商品がありません");
});

test("S-78 ② 空のカートも押せず、買える商品がありませんと出す", () => {
  assert.deepEqual(orderGate([], {}), { canOrder: false, hint: "買える商品がありません" });
});

test("S-78 ③ 在庫ありの商品が 1 つでもあれば押せる（文言は出さない）。押すとデモの文言と、計測の段 6 を 1 件", () => {
  const ids = ["G1", "G2"];
  const found = { G1: gone, G2: ok("available") };
  assert.deepEqual(orderGate(ids, found), { canOrder: true, hint: null });
  const calls: [EventStep, EventExtra | undefined][] = [];
  const msg = pressOrder(ids, found, (s, e) => void calls.push([s, e]));
  assert.equal(msg, ORDER_DEMO_MESSAGE);
  assert.equal(msg, "デモのため、注文はできません");
  assert.deepEqual(calls, [[6, undefined]]);
});

test("SP-34 ⑥ 押せないときは計測も送らない（買える商品 0 件）", () => {
  const calls: EventStep[] = [];
  assert.equal(pressOrder(["G1"], { G1: ok("out_of_stock") }, (s) => void calls.push(s)), null);
  assert.equal(pressOrder([], {}, (s) => void calls.push(s)), null);
  assert.deepEqual(calls, []);
});

test("S-78 行の画像と詳細への道は、商品がある行だけ（在庫なしも出す。販売終了・読めない・確認中の行には置かない）", () => {
  assert.equal(rowHasProduct(ok("available")), true);
  assert.equal(rowHasProduct(ok("out_of_stock")), true);
  assert.equal(rowHasProduct(gone), false);
  assert.equal(rowHasProduct(bad), false);
  assert.equal(rowHasProduct(undefined), false);
});

test("S-78 「買い物を続ける」: トップなどからは /search へ。すでに /search ならどこへも移らない（閉じるだけ。条件は変えない）", () => {
  assert.equal(continueTarget("/"), "/search");
  assert.equal(continueTarget("/s/abc"), "/search");
  assert.equal(continueTarget(null), "/search");
  assert.equal(continueTarget("/search"), null);
});

test("S-99 届く日: 「{M}/{D}までに届く（目安）」。0 を付けない。月をまたいでも出てきた日付のまま。null・無い・形の違う値は出さない", () => {
  assert.equal(arrivesText("2026-11-17"), "11/17までに届く（目安）");
  assert.equal(arrivesText("2026-12-02"), "12/2までに届く（目安）");
  assert.equal(arrivesText("2027-01-03"), "1/3までに届く（目安）");
  assert.equal(arrivesText(null), null);
  assert.equal(arrivesText(undefined), null);
  assert.equal(arrivesText(""), null);
  assert.equal(arrivesText("11/17"), null);
  assert.equal(arrivesText("2026-13-01"), null);
  assert.equal(arrivesText("2026-11-00"), null);
});
