import test from "node:test";
import assert from "node:assert/strict";
import { pageCount, pageNumbers, prevNext, rangeText } from "./pagination.ts";

// U-41 U-48 S-60 #46-5: 30件は 12・12・6。範囲外のページは API が1ページ目を返す（応答の page を使う）
test("pagination U-48: 30件 → 1ページ目「全30件中1〜12件」、3ページ目「25〜30件」", () => {
  assert.equal(rangeText(30, 1), "全30件中1〜12件を表示");
  assert.equal(rangeText(30, 2), "全30件中13〜24件を表示");
  assert.equal(rangeText(30, 3), "全30件中25〜30件を表示");
});
test("pagination U-48: 31件 → 3ページ目「25〜31件」。0件は出さない", () => {
  assert.equal(rangeText(31, 3), "全31件中25〜31件を表示");
  assert.equal(rangeText(0, 1), null);
});
test("pagination U-41: 30件の1ページごとの件数は 12・12・6", () => {
  const per = [1, 2, 3].map((p) => {
    const t = rangeText(30, p) ?? "";
    const [a, b] = t.match(/中(\d+)〜(\d+)件/)!.slice(1).map(Number);
    return b - a + 1;
  });
  assert.deepEqual(per, [12, 12, 6]);
});
test("pagination: ページ数と番号。12件ちょうどや0件は番号を出さない", () => {
  assert.equal(pageCount(30), 3);
  assert.equal(pageCount(31), 3);
  assert.equal(pageCount(34), 3);
  assert.deepEqual(pageNumbers(30), [1, 2, 3]);
  assert.deepEqual(pageNumbers(12), []);
  assert.deepEqual(pageNumbers(0), []);
});
test("pagination: 前へ・次へは端で null", () => {
  assert.deepEqual(prevNext(30, 1), { prev: null, next: 2 });
  assert.deepEqual(prevNext(30, 2), { prev: 1, next: 3 });
  assert.deepEqual(prevNext(30, 3), { prev: 2, next: null });
  assert.deepEqual(prevNext(0, 1), { prev: null, next: null });
});
