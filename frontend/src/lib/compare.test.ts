import test from "node:test";
import assert from "node:assert/strict";
import { arrivesText, canCompare, canSelectMore, compareLabel, pruneSelection, ratingCell, toggleSelect, wrappingText } from "./compare.ts";

// U-76（D-46）: 比べる選択（SP-23）。お気に入りに 4 件
const ids = ["G1", "G2", "G3", "G4"];
test("U-76: 1 件では押せず、2〜3 件で押せる", () => {
  let s: string[] = [];
  s = toggleSelect(s, "G1");
  assert.equal(canCompare(s.length), false);
  s = toggleSelect(s, "G2");
  assert.equal(canCompare(s.length), true);
  s = toggleSelect(s, "G3");
  assert.equal(canCompare(s.length), true);
});
test("U-76: 3 件選んでいる間は 4 件目が選べない。1 件外せば選べる", () => {
  let s = ["G1", "G2", "G3"];
  assert.equal(canSelectMore(s), false);
  assert.deepEqual(toggleSelect(s, "G4"), ["G1", "G2", "G3"]);
  s = toggleSelect(s, "G1");
  assert.equal(canSelectMore(s), true);
  assert.deepEqual(toggleSelect(s, "G4"), ["G2", "G3", "G4"]);
});
test("SP-23: 一覧で外した商品は選択からも外れる。ボタンの文字は件数つき", () => {
  assert.deepEqual(pruneSelection(["G1", "G2"], ids.filter((x) => x !== "G1")), ["G2"]);
  assert.equal(compareLabel(0), "比べる");
  assert.equal(compareLabel(2), "比べる（2件選択中）");
});
test("U-76: 値の無い項目は「—」で、空欄にならない", () => {
  assert.equal(arrivesText(null), "—");
  assert.equal(arrivesText(undefined), "—");
  assert.equal(arrivesText("2026-11-20"), "11/20までに届く（目安）");
  assert.equal(arrivesText("2026-01-05"), "1/5までに届く（目安）");
  assert.equal(wrappingText(true), "あり");
  assert.equal(wrappingText(false), "なし");
  assert.equal(wrappingText(null), "—");
  assert.equal(ratingCell(4.7, 120), "4.7（120件）");
  assert.equal(ratingCell(4, 3), "4.0（3件）");
  assert.equal(ratingCell(null, null), "—");
  assert.equal(ratingCell(4.5, null), "—");
});
