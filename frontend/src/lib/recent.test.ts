import assert from "node:assert/strict";
import { test } from "node:test";
import { addRecent, parseRecent, removeRecent } from "./recent.ts";

test("recent U-75: 7 商品を開くと最大 6 件で、一番古いものが消える。新しい順", () => {
  let l: string[] = [];
  for (let i = 1; i <= 7; i++) l = addRecent(l, `G000${i}`);
  assert.deepEqual(l, ["G0007", "G0006", "G0005", "G0004", "G0003", "G0002"]);
});
test("recent U-75: 同じ商品をもう一度開くと 1 件にまとめて先頭へ", () => {
  assert.deepEqual(addRecent(["G0003", "G0002", "G0001"], "G0001"), ["G0001", "G0003", "G0002"]);
});
test("recent U-75: 見つからない商品は保存から消せる。形の違う ID は入れない", () => {
  assert.deepEqual(removeRecent(["G0003", "G0002"], "G0002"), ["G0003"]);
  assert.deepEqual(addRecent(["G0003"], "x"), ["G0003"]);
});
test("recent U-75: 保存の読み出し。壊れた値・配列でない値・保存なしは空。重複と形の違う ID は捨てる", () => {
  assert.deepEqual(parseRecent(null), []);
  assert.deepEqual(parseRecent(""), []);
  assert.deepEqual(parseRecent("{oops"), []);
  assert.deepEqual(parseRecent('{"a":1}'), []);
  assert.deepEqual(parseRecent('["G0001","G0001","bad",3,"G0002"]'), ["G0001", "G0002"]);
  assert.equal(parseRecent(JSON.stringify(Array.from({ length: 9 }, (_, i) => `G000${i}`))).length, 6);
});
