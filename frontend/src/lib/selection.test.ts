import test from "node:test";
import assert from "node:assert/strict";
import { canCreate, isOverLimit, OVER_LIMIT_MESSAGE, SHARE_LIMIT, toCandidate } from "./selection.ts";
import { initialState, reducer, type AppState, type Candidate } from "../state/selection.ts";

// U-16 S-08 S-09 #36 #41-5〜7: 選択は上限なし／全部外すと0／重複なし／選んだ順／外して選び直すと末尾。
const item = (id: number): Candidate => ({ productId: id, name: `商品${id}`, price: 1000 + id });
const pickN = (n: number): AppState => {
  let s = initialState;
  for (let i = 1; i <= n; i++) s = reducer(s, { type: "pick", item: item(i) });
  return s;
};

for (const n of [0, 1, 11, 100]) {
  test(`selection U-16: ${n} 件選べる（上限なし）`, () => {
    assert.equal(pickN(n).picked.size, n);
  });
}

test("selection S-09: 全部外すと 0 件", () => {
  let s = pickN(11);
  for (let i = 1; i <= 11; i++) s = reducer(s, { type: "unpick", productId: i });
  assert.equal(s.picked.size, 0);
});

test("selection S-08: 同じ商品は重複しない", () => {
  let s = pickN(2);
  s = reducer(s, { type: "pick", item: item(1) });
  assert.deepEqual([...s.picked.keys()], [1, 2]);
});

test("selection #41-7: 選んだ順（3位→1位→2位→D）で並ぶ。外して選び直した商品は末尾", () => {
  let s = initialState;
  for (const id of [3, 1, 2, 9]) s = reducer(s, { type: "pick", item: item(id) });
  assert.deepEqual([...s.picked.keys()], [3, 1, 2, 9]);
  s = reducer(s, { type: "unpick", productId: 3 });
  s = reducer(s, { type: "pick", item: item(3) });
  assert.deepEqual([...s.picked.keys()], [1, 2, 9, 3]);
});

test("selection #36: 10件までは作れ、11件以上は押せない。0件も押せない。作成中も押せない", () => {
  assert.equal(SHARE_LIMIT, 10);
  assert.equal(canCreate(0), false);
  assert.equal(canCreate(1), true);
  assert.equal(canCreate(10), true);
  assert.equal(isOverLimit(10), false);
  assert.equal(isOverLimit(11), true);
  assert.equal(canCreate(11), false);
  assert.equal(canCreate(5, true), false);
  assert.equal(OVER_LIMIT_MESSAGE, "共有リンクに入れられるのは10件までです。選ぶ数を減らしてください");
});

test("selection D-08: 選んだ時点の表示用の情報（category・高評価・理由）を持つ", () => {
  const c = toCandidate({ product_id: 7, name: "タオル", price: 4000, category: "生活雑貨", high_rating: true, reason: "理由" });
  assert.deepEqual(c, { productId: 7, name: "タオル", price: 4000, reason: "理由", category: "生活雑貨", highRating: true });
});
