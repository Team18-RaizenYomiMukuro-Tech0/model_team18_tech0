import test from "node:test";
import assert from "node:assert/strict";
import { funnelRates } from "./funnel.ts";

// U-80: 訪問4件（6段まで／3段で終わる／1段だけ／同じ段が2回）＋段の順番が入れ替わった訪問
test("U-80 通過率: ①の訪問の数で割る。重複は1回、順番は見ない", () => {
  const rows = funnelRates([[1, 2, 3, 4, 5, 6], [1, 2, 3], [1], [1, 2, 2, 2], [3, 1, 2]]);
  assert.deepEqual(rows.map((r) => r.visits), [5, 4, 3, 1, 1, 1]);
  assert.deepEqual(rows.map((r) => r.rate), [1, 0.8, 0.6, 0.2, 0.2, 0.2]);
});

test("U-80 ①が0件なら0で割らず null（—）", () => {
  const rows = funnelRates([[2, 3], []]);
  assert.ok(rows.every((r) => r.rate === null));
  assert.equal(rows[1]?.visits, 1);
  assert.ok(funnelRates([]).every((r) => r.rate === null && r.visits === 0));
});

test("段7（0件）は漏斗の外。数えない", () => {
  const rows = funnelRates([[1, 7]]);
  assert.equal(rows.length, 6);
  assert.deepEqual(rows.map((r) => r.visits), [1, 0, 0, 0, 0, 0]);
});

test("段の順番が入れ替わった訪問も、記録があれば通ったと数える（ADR-011）", () => {
  const rows = funnelRates([[1, 4, 2]]);
  assert.deepEqual(rows.map((r) => r.visits), [1, 1, 0, 1, 0, 0]);
});
