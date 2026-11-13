import test from "node:test";
import assert from "node:assert/strict";
import { FAVORITES_KEY, createFavoritesStore, loadFavorites, saveFavorites, type StoreLike } from "./favorites.ts";

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
  s.add("G0003");
  s.add("G0001");
  assert.deepEqual(JSON.parse(m.data.get(FAVORITES_KEY) ?? "null"), ["G0003", "G0001"]);
});

test("favorites U-43: 同じ商品をもう一度登録しても1件（重複しない）", () => {
  const s = createFavoritesStore(() => memory());
  s.add("G0005");
  s.add("G0005");
  s.toggle("G0007");
  s.add("G0007");
  assert.deepEqual([...s.getSnapshot()], ["G0005", "G0007"]);
});

test("favorites U-43: 解除で消える。ハートを押し直す（toggle）と登録→解除→登録", () => {
  const s = createFavoritesStore(() => memory());
  s.add("G0002");
  s.remove("G0002");
  assert.deepEqual([...s.getSnapshot()], []);
  s.toggle("G0002");
  assert.ok(s.has("G0002"));
  s.toggle("G0002");
  assert.ok(!s.has("G0002"));
});

test("favorites U-43: 保存を読み直しても登録が残る（再読込）", () => {
  const m = memory();
  createFavoritesStore(() => m).add("G0009");
  const reloaded = createFavoritesStore(() => m); // 新しい store = 再読込
  assert.deepEqual([...reloaded.getSnapshot()], ["G0009"]);
});

test("favorites #225: 実際の商品IDの形（G0001）の配列を保存して読み出すと2件そのまま返る", () => {
  const m = memory();
  saveFavorites(m, ["G0001", "G0002"]);
  assert.deepEqual(loadFavorites(m), ["G0001", "G0002"]);
});

test("favorites U-43: 壊れた保存の値は空として読む。空でない文字列だけ残し、数・空文字・重複は捨てる", () => {
  const m = memory();
  m.data.set(FAVORITES_KEY, "{not json");
  assert.deepEqual(loadFavorites(m), []);
  m.data.set(FAVORITES_KEY, JSON.stringify(["G0001", 2, "", "G0004", "G0001", null, 1.5]));
  assert.deepEqual(loadFavorites(m), ["G0001", "G0004"]);
  m.data.set(FAVORITES_KEY, JSON.stringify({ a: 1 }));
  assert.deepEqual(loadFavorites(m), []);
});

test("favorites U-43: 保存が使えなくても（読み書きで例外）画面の状態は動く", () => {
  const s = createFavoritesStore(() => broken);
  assert.doesNotThrow(() => s.add("G0001"));
  assert.doesNotThrow(() => s.toggle("G0002"));
  assert.deepEqual([...s.getSnapshot()], ["G0001", "G0002"]); // 画面の中では同期して使える
  const none = createFavoritesStore(() => null); // 保存そのものが無い
  assert.doesNotThrow(() => none.add("G0003"));
  assert.ok(none.has("G0003"));
});

test("favorites S-62: 変更は購読者（すべてのハート・パネル）に届く", () => {
  const s = createFavoritesStore(() => memory());
  let n = 0;
  const off = s.subscribe(() => n++);
  s.add("G0001");
  s.add("G0001"); // 変化なしは通知しない
  s.remove("G0001");
  off();
  s.add("G0002");
  assert.equal(n, 2);
});
