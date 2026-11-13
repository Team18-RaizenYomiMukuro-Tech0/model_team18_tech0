import test from "node:test";
import assert from "node:assert/strict";
import { CART_KEY, cartTotal, createCartStore, loadCart, normalizeQty, saveCart, type CartInfo, type StoreLike } from "./cart.ts";

// U-44 S-30 S-63 D-31 #50-5 #53-4 #54-9 #56-3: カート。giftia:cart は {商品ID: 数量}。追加で +1、数量は 1〜99、合計は販売終了・在庫なしを除く。
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

test("cart U-44: 追加すると giftia:cart に {商品ID: 数量} が入る。同じ商品の追加は +1（2件にならない）", () => {
  const m = memory();
  const s = createCartStore(() => m);
  s.add("G0001");
  s.add("G0001");
  s.add("G0002");
  assert.deepEqual(JSON.parse(m.data.get(CART_KEY) ?? "null"), { G0001: 2, G0002: 1 });
});

test("cart U-44: 数量は 99 まで。99 の商品をもう一度追加しても 99", () => {
  const s = createCartStore(() => memory());
  s.add("G0001");
  s.setQty("G0001", 99);
  s.add("G0001");
  assert.equal(s.getSnapshot().G0001, 99);
});

test("cart U-44: 数量変更・削除。無い商品の変更は何もしない", () => {
  const s = createCartStore(() => memory());
  s.add("G0001");
  s.add("G0002");
  s.setQty("G0001", 5);
  s.setQty("G9999", 3);
  s.remove("G0002");
  assert.deepEqual({ ...s.getSnapshot() }, { G0001: 5 });
});

test("cart S-30: 保存を読み直しても残る（再読込）", () => {
  const m = memory();
  const a = createCartStore(() => m);
  a.add("G0003");
  a.setQty("G0003", 7);
  assert.deepEqual({ ...createCartStore(() => m).getSnapshot() }, { G0003: 7 });
});

const cases: [string, number, number][] = [
  ["100", 3, 99], // 100 以上は 99
  ["5000", 3, 99],
  ["99", 3, 99],
  ["0", 3, 1], // 0 以下は 1
  ["-3", 3, 1],
  ["", 3, 3], // 空・小数・数字以外は直前の数量
  ["   ", 3, 3],
  ["1.5", 3, 3],
  ["abc", 3, 3],
  ["５", 3, 5], // 全角は半角に
  ["１2", 3, 12], // 混在も半角に
  ["１．５", 3, 3], // 全角の小数点は小数として直前の数量
  ["12", 3, 12],
  ["007", 3, 7],
];
for (const [raw, prev, want] of cases) {
  test(`cart U-44 #53-4: 数量の入力 ${JSON.stringify(raw)}（直前 ${prev}）→ ${want}`, () => {
    assert.equal(normalizeQty(raw, prev), want);
  });
}

test("cart U-44: 合計は販売終了（404）・在庫なし・確かめ前を除く。ほかの商品の合計は合っている", () => {
  const info: Record<string, CartInfo> = {
    G0001: { status: "ok", price: 1500, stock: "available" },
    G0002: { status: "ok", price: 3000, stock: "out_of_stock" },
    G0003: { status: "notfound" },
    G0004: { status: "ok", price: 2000, stock: "available" },
  };
  const cart = { G0001: 2, G0002: 5, G0003: 1, G0004: 1, G0005: 9 };
  assert.equal(cartTotal(cart, info), 1500 * 2 + 2000);
  assert.equal(cartTotal({}, info), 0);
});

test("cart U-44: 壊れた保存の値は空として読む。数量は整数だけ 1〜99 に収め、ほかは捨てる", () => {
  const m = memory();
  m.data.set(CART_KEY, "{not json");
  assert.deepEqual(loadCart(m), {});
  m.data.set(CART_KEY, "[1,2]");
  assert.deepEqual(loadCart(m), {});
  m.data.set(CART_KEY, JSON.stringify({ G0001: 250, G0002: 0, G0003: 1.5, G0004: "3", "": 2, G0005: 4 }));
  assert.deepEqual(loadCart(m), { G0001: 99, G0002: 1, G0005: 4 });
});

test("cart U-44: 保存が使えなくても（読み書きで例外）画面の状態は動く", () => {
  const s = createCartStore(() => broken);
  s.add("G0001");
  s.add("G0001");
  assert.deepEqual({ ...s.getSnapshot() }, { G0001: 2 });
  assert.deepEqual(loadCart(broken), {});
  saveCart(broken, { G0001: 1 }); // 例外を出さない
});

test("cart: すべての部品が同じ store を見る（変更は購読者に届く）", () => {
  const s = createCartStore(() => memory());
  let n = 0;
  const off = s.subscribe(() => n++);
  s.add("G0001");
  s.setQty("G0001", 4);
  s.remove("G0001");
  off();
  s.add("G0002");
  assert.equal(n, 3);
});
