import test from "node:test";
import assert from "node:assert/strict";
import { FAVORITES_KEY, createFavoritesStore, loadFavorites, type StoreLike } from "./favorites.ts";

// U-43 D-30 SP-13 S-26 S-62 #45-7: 登録 → 同じ商品をもう一度登録 → 解除 → 保存を読み直す。保存が使えなくても止まらない。
// テストごとに空の保存から始める（作り直す）。
function memory(): StoreLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}
const broken: StoreLike = {
  getItem: () => {
    throw new Error("denied");
  },
  setItem: () => {
    throw new Error("denied");
  },
};

test("favorites U-43: 登録すると giftia:favorites に商品IDの配列が入る", () => {
  const m = memory();
  const s = createFavoritesStore(() => m);
  s.add(3);
  s.add(1);
  assert.deepEqual(JSON.parse(m.data.get(FAVORITES_KEY) ?? "null"), [3, 1]);
});

test("favorites U-43: 同じ商品をもう一度登録しても1件（重複しない）", () => {
  const s = createFavoritesStore(() => memory());
  s.add(5);
  s.add(5);
  s.toggle(7);
  s.add(7);
  assert.deepEqual([...s.getSnapshot()], [5, 7]);
});

test("favorites U-43: 解除で消える。ハートを押し直す（toggle）と登録→解除→登録", () => {
  const s = createFavoritesStore(() => memory());
  s.add(2);
  s.remove(2);
  assert.deepEqual([...s.getSnapshot()], []);
  s.toggle(2);
  assert.ok(s.has(2));
  s.toggle(2);
  assert.ok(!s.has(2));
});

test("favorites U-43: 保存を読み直しても登録が残る（再読込）", () => {
  const m = memory();
  createFavoritesStore(() => m).add(9);
  const reloaded = createFavoritesStore(() => m); // 新しい store = 再読込
  assert.deepEqual([...reloaded.getSnapshot()], [9]);
});

test("favorites U-43: 壊れた保存の値は空として読む。正の整数以外と重複は捨てる", () => {
  const m = memory();
  m.data.set(FAVORITES_KEY, "{not json");
  assert.deepEqual(loadFavorites(m), []);
  m.data.set(FAVORITES_KEY, JSON.stringify([1, "2", 1.5, -3, 0, 4, 1, null]));
  assert.deepEqual(loadFavorites(m), [1, 4]);
  m.data.set(FAVORITES_KEY, JSON.stringify({ a: 1 }));
  assert.deepEqual(loadFavorites(m), []);
});

test("favorites U-43: 保存が使えなくても（読み書きで例外）画面の状態は動く", () => {
  const s = createFavoritesStore(() => broken);
  assert.doesNotThrow(() => s.add(1));
  assert.doesNotThrow(() => s.toggle(2));
  assert.deepEqual([...s.getSnapshot()], [1, 2]); // 画面の中では同期して使える
  const none = createFavoritesStore(() => null); // 保存そのものが無い
  assert.doesNotThrow(() => none.add(3));
  assert.ok(none.has(3));
});

test("favorites S-62: 変更は購読者（すべてのハート・パネル）に届く", () => {
  const s = createFavoritesStore(() => memory());
  let n = 0;
  const off = s.subscribe(() => n++);
  s.add(1);
  s.add(1); // 変化なしは通知しない
  s.remove(1);
  off();
  s.add(2);
  assert.equal(n, 2);
});
