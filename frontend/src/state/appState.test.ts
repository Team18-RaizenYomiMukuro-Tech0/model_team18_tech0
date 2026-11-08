import test from "node:test";
import assert from "node:assert/strict";
import { initialState, reducer, type AppState, type Candidate } from "./selection.ts";

// U-47 D-32 SP-04 #46-1: 選んだ候補は画面移動・R-01⇄R-02 の切り替えのあとも残り、再読込（新しい状態）で消える。
const A: Candidate = { productId: 1, name: "綿の店 ふわり ガーゼタオルセット", price: 4000, reason: "職場の送別で48回選ばれています。" };
const B: Candidate = { productId: 2, name: "日本酒 小瓶 3本", price: 5400 };
const R01 = [A, B];
const R02 = [B, { productId: 3, name: "山の香 ほうじ茶ギフト", price: 4100 }];

test("appState U-47: A・B を選ぶと選んだ順に入る", () => {
  let s: AppState = initialState;
  s = reducer(s, { type: "pick", item: A });
  s = reducer(s, { type: "pick", item: B });
  assert.deepEqual([...s.picked.keys()], [1, 2]);
});

test("appState U-47: トップ→検索結果→R-02 の12件→再びR-01 と結果が替わっても A・B は残る", () => {
  let s: AppState = initialState;
  s = reducer(s, { type: "pick", item: A });
  s = reducer(s, { type: "pick", item: B });
  s = reducer(s, { type: "setLastR01", items: R01 });
  s = reducer(s, { type: "setLastR01", items: R02 }); // R-02 に切り替え
  s = reducer(s, { type: "setLastR01", items: R01 }); // 再びシーンを押す
  assert.deepEqual([...s.picked.keys()], [1, 2]);
  assert.deepEqual(s.picked.get(1), A); // 選んだ時点の表示用の情報もそのまま
  assert.deepEqual(s.lastR01, R01);
});

test("appState U-47: 描画し直す（再読込）と消える。新しい状態は空", () => {
  let s: AppState = initialState;
  s = reducer(s, { type: "pick", item: A });
  const fresh: AppState = initialState; // 再読込 = アプリが最初の状態から始まる
  assert.equal(fresh.picked.size, 0);
  assert.equal(fresh.lastR01, null);
  assert.equal(s.picked.size, 1); // 元の状態は書き換えない
});

test("appState SP-04: 同じ商品IDをもう一度選んでも1件。外すと消える", () => {
  let s: AppState = initialState;
  s = reducer(s, { type: "pick", item: A });
  s = reducer(s, { type: "pick", item: A });
  assert.equal(s.picked.size, 1);
  s = reducer(s, { type: "unpick", productId: 1 });
  assert.equal(s.picked.size, 0);
});

test("appState D-32: 保存（localStorage・sessionStorage）に書かない", async () => {
  const { readFileSync } = await import("node:fs");
  for (const f of ["src/state/selection.ts", "src/state/AppState.tsx"]) {
    assert.doesNotMatch(readFileSync(f, "utf8").replace(/\/\/.*$/gm, ""), /localStorage|sessionStorage|document\.cookie|indexedDB/);
  }
});
