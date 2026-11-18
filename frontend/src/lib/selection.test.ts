import test from "node:test";
import assert from "node:assert/strict";
import { canCreate, isOverLimit, OVER_LIMIT_MESSAGE, productCandidate, SHARE_CHANGED_MESSAGE, SHARE_LIMIT, shareListChanged, shareScene, toCandidate } from "./selection.ts";
import { initialState, reducer, type AppState, type Candidate } from "../state/selection.ts";

// U-16 S-08 S-09 #36 #41-5〜7: 選択は上限なし／全部外すと0／重複なし／選んだ順／外して選び直すと末尾。
const gid = (n: number): string => `G${String(n).padStart(4, "0")}`; // 実際の商品IDの形（G0001）
const item = (n: number): Candidate => ({ productId: gid(n), name: `商品${n}`, price: 1000 + n });
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
  for (let i = 1; i <= 11; i++) s = reducer(s, { type: "unpick", productId: gid(i) });
  assert.equal(s.picked.size, 0);
});

test("selection S-08: 同じ商品は重複しない", () => {
  let s = pickN(2);
  s = reducer(s, { type: "pick", item: item(1) });
  assert.deepEqual([...s.picked.keys()], [1, 2].map(gid));
});

test("selection #41-7: 選んだ順（3位→1位→2位→D）で並ぶ。外して選び直した商品は末尾", () => {
  let s = initialState;
  for (const id of [3, 1, 2, 9]) s = reducer(s, { type: "pick", item: item(id) });
  assert.deepEqual([...s.picked.keys()], [3, 1, 2, 9].map(gid));
  s = reducer(s, { type: "unpick", productId: gid(3) });
  s = reducer(s, { type: "pick", item: item(3) });
  assert.deepEqual([...s.picked.keys()], [1, 2, 9, 3].map(gid));
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
  const c = toCandidate({ product_id: "G0007", name: "タオル", price: 4000, category: "生活雑貨", high_rating: true, reason: "理由" });
  assert.deepEqual(c, { productId: "G0007", name: "タオル", price: 4000, reason: "理由", category: "生活雑貨", highRating: true });
});

// F-47 SP-05 D-05: 共有リンクに送る scene。選んだ候補がどれも同じシーンのときだけ送る
test("selection F-47: shareScene は同じシーンだけ・混ざる／無いは null", () => {
  const c = (id: string, scene: string | null): Candidate => ({ productId: id, name: id, price: 1, scene });
  assert.equal(shareScene([]), null);
  assert.equal(shareScene([c("G0001", "送別"), c("G0002", "送別")]), "送別");
  assert.equal(shareScene([c("G0001", "送別"), c("G0002", null)]), null);
  assert.equal(shareScene([c("G0001", "送別"), c("G0002", "お礼")]), null);
  assert.equal(shareScene([c("G0001", null)]), null);
});
test("selection F-47: productCandidate は理由・シーンを持たない", () => {
  const p = productCandidate({ product_id: "G0003", name: "X", price: 1200, category: "食品", high_rating: true });
  assert.deepEqual(p, { productId: "G0003", name: "X", price: 1200, category: "食品", highRating: true });
});

test("U-98 share changed: 作成時の並びと今の並びが同じなら案内は出ない（まだ作っていないときも出ない）", () => {
  assert.equal(shareListChanged(["A", "B", "C"], ["A", "B", "C"]), false);
  assert.equal(shareListChanged(null, ["A", "B"]), false);
  assert.equal(shareListChanged(null, []), false);
});
test("U-98 share changed: 足した・外したら案内が出る", () => {
  assert.equal(shareListChanged(["A", "B"], ["A", "B", "C"]), true);
  assert.equal(shareListChanged(["A", "B", "C"], ["A", "B"]), true);
  assert.equal(shareListChanged(["A"], []), true);
});
test("U-98 share changed: 順番が変わったら案内が出る（並びも比べる）", () => {
  assert.equal(shareListChanged(["A", "B", "C"], ["B", "A", "C"]), true);
  assert.equal(shareListChanged(["A", "B"], ["A", "C"]), true);
});
test("U-98 share changed: 元に戻したら案内が消える・作り直したら（送った並び＝今の並び）消える", () => {
  const sent = ["A", "B", "C"];
  assert.equal(shareListChanged(sent, ["A", "B"]), true);
  assert.equal(shareListChanged(sent, ["A", "B", "C"]), false); // 元に戻した
  assert.equal(shareListChanged(["A", "B"], ["A", "B"]), false); // 作り直して送った並びが今の並びになった
});
test("U-98 share changed: 文言は決まった 1 文（一字も変えない）", () => {
  assert.equal(SHARE_CHANGED_MESSAGE, "共有リストを変更しました。変更後のリストを送るには、もう一度『共有リストを作る』を押してください。表示中のリンクは変更前のリストのままです。");
});
