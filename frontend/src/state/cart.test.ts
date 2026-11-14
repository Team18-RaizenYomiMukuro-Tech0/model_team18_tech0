import test from "node:test";
import assert from "node:assert/strict";
import { canDecrease, canIncrease, CART_KEY, cartCount, cartTotal, createCartStore, loadCart, normalizeQty, saveCart, stepQty, type CartInfo, type StoreLike } from "./cart.ts";
import { CartChecker, type CartFound } from "./cartCheck.ts";
import { ADDED_MESSAGE, CORRUPT_MESSAGE, NoticeController } from "./cartNotice.ts";

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

// U-54 D-25: ヘッダーのカートの数は商品の種類の数（数量の合計ではない）
test("cart U-54: 1,500円×2 と 2,000円×1 を入れると、数は 2（種類の数。数量の合計 3 ではない）", () => {
  const s = createCartStore(() => memory());
  s.add("G0001");
  s.add("G0001");
  s.add("G0002");
  assert.equal(cartCount(s.getSnapshot()), 2);
  assert.equal(Object.values(s.getSnapshot()).reduce((a, b) => a + b, 0), 3);
});

// U-55 D-31: ＋／−
test("cart U-55: 1 で − は押せない、99 で ＋ は押せない。2 で −→1、98 で ＋→99。境界を超えない", () => {
  assert.equal(canDecrease(1), false);
  assert.equal(canDecrease(2), true);
  assert.equal(canIncrease(99), false);
  assert.equal(canIncrease(98), true);
  assert.equal(stepQty(2, -1), 1);
  assert.equal(stepQty(98, 1), 99);
  assert.equal(stepQty(1, -1), 1);
  assert.equal(stepQty(99, 1), 99);
});

test("cart U-55: 押すたびに数量が変わり、合計が変わる", () => {
  const s = createCartStore(() => memory());
  s.add("G0001"); // 1
  const info: Record<string, CartInfo> = { G0001: { status: "ok", price: 1500, stock: "available" } };
  s.setQty("G0001", stepQty(s.getSnapshot().G0001, 1));
  assert.equal(cartTotal(s.getSnapshot(), info), 3000);
  s.setQty("G0001", stepQty(s.getSnapshot().G0001, -1));
  assert.equal(cartTotal(s.getSnapshot(), info), 1500);
});

// U-56 D-31: もう一度読み込む
const okInfo: CartFound = { status: "ok", price: 1500, stock: "available", name: "A" };
const tick = () => new Promise((r) => setImmediate(r));
function checker(results: Record<string, CartFound[]>) {
  const calls: string[] = [];
  const seen: Record<string, CartFound>[] = [];
  const c = new CartChecker(
    async (id) => {
      calls.push(id);
      return results[id].shift() as CartFound;
    },
    (f) => seen.push({ ...f }),
  );
  return { c, calls, seen };
}

test("cart U-56: 失敗の商品の「もう一度読み込む」で、その商品だけ読み直す（成功したら出る）。ほかは読み直さない", async () => {
  const { c, calls, seen } = checker({ G1: [{ status: "error" }, okInfo], G2: [okInfo] });
  c.check(["G1", "G2"]);
  await tick();
  assert.equal(seen.at(-1)?.G1?.status, "error");
  c.retry("G1");
  assert.equal(seen.at(-1)?.G1, undefined); // 読み込み中の表示に戻る
  await tick();
  assert.equal(seen.at(-1)?.G1?.status, "ok");
  assert.deepEqual(calls, ["G1", "G2", "G1"]);
});

test("cart U-56: 読み直しも失敗なら同じ表示のまま。成功した商品・404 の商品には retry しても何もしない", async () => {
  const { c, calls, seen } = checker({ G1: [{ status: "error" }, { status: "error" }], G2: [okInfo], G3: [{ status: "notfound" }] });
  c.check(["G1", "G2", "G3"]);
  await tick();
  c.retry("G1");
  await tick();
  assert.equal(seen.at(-1)?.G1?.status, "error");
  c.retry("G2");
  c.retry("G3");
  await tick();
  assert.deepEqual(calls, ["G1", "G2", "G3", "G1"]);
  assert.equal(cartTotal({ G1: 1, G2: 1 }, seen.at(-1) ?? {}), 1500); // 読めない商品は合計に入らない
});

test("cart U-56: check を重ねても確かめ済みの商品は読み直さない。dispose 後の応答は捨てる", async () => {
  const { c, calls, seen } = checker({ G1: [okInfo], G2: [okInfo] });
  c.check(["G1"]);
  c.check(["G1", "G2"]);
  c.dispose();
  await tick();
  assert.deepEqual(calls, ["G1", "G2"]);
  assert.equal(seen.length, 0);
});

// U-57 D-31: 「カートに入れました」の通知
test("cart U-57: 追加すると「カートに入れました」が出て、約3秒で消える", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const n = new NoticeController();
  const s = createCartStore(() => memory(), n);
  s.add("G0001");
  assert.equal(n.getSnapshot()?.kind, "added");
  assert.equal(ADDED_MESSAGE, "カートに入れました");
  t.mock.timers.tick(2999);
  assert.equal(n.getSnapshot()?.kind, "added");
  t.mock.timers.tick(1);
  assert.equal(n.getSnapshot(), null);
});

test("cart U-57: マウス・フォーカスが乗っている間は消えない。離れたら3秒を数え直す", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const n = new NoticeController();
  n.show("added");
  t.mock.timers.tick(2000);
  n.hold(); // マウスが乗る
  n.hold(); // Tab でフォーカスも乗る
  t.mock.timers.tick(10000);
  assert.notEqual(n.getSnapshot(), null);
  n.release();
  t.mock.timers.tick(10000);
  assert.notEqual(n.getSnapshot(), null); // まだフォーカスが残っている
  n.release();
  t.mock.timers.tick(2999);
  assert.notEqual(n.getSnapshot(), null);
  t.mock.timers.tick(1);
  assert.equal(n.getSnapshot(), null);
});

test("cart U-57: 続けて追加したら、新しい通知から3秒を数え直す。「カートを見る」で閉じられる", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const n = new NoticeController();
  const s = createCartStore(() => memory(), n);
  s.add("G0001");
  t.mock.timers.tick(2500);
  s.add("G0001");
  t.mock.timers.tick(2500);
  assert.notEqual(n.getSnapshot(), null);
  t.mock.timers.tick(500);
  assert.equal(n.getSnapshot(), null);
  s.add("G0002");
  n.dismiss();
  assert.equal(n.getSnapshot(), null);
});

test("cart U-57: 追加の通知は store の追加だけで出る（読み出しだけでは出ない）", () => {
  const n = new NoticeController();
  const s = createCartStore(() => memory(), n);
  s.getSnapshot();
  s.setQty("G0001", 3);
  assert.equal(n.getSnapshot(), null);
});

// U-58 D-10: 壊れた保存データ
for (const bad of ["{abc", "[1,2]", '"x"', "null", "5"]) {
  test(`cart U-58: 壊れた保存 ${bad} は空にして保存し直し、知らせは1回だけ`, () => {
    const m = memory();
    m.data.set(CART_KEY, bad);
    const s = createCartStore(() => m);
    assert.deepEqual({ ...s.getSnapshot() }, {});
    assert.equal(m.data.get(CART_KEY), "{}"); // 空で保存し直された
    assert.equal(s.takeCorruptNotice(), true);
    assert.equal(s.takeCorruptNotice(), false); // 画面を移っても繰り返さない
    const again = createCartStore(() => m); // 再読み込み
    assert.deepEqual({ ...again.getSnapshot() }, {});
    assert.equal(again.takeCorruptNotice(), false);
  });
}

test("cart U-58: 壊れていない保存・空・保存が使えない環境では知らせない。壊れたあとも追加できる", () => {
  const ok = memory();
  ok.data.set(CART_KEY, '{"G0001":2}');
  const a = createCartStore(() => ok);
  assert.equal(a.takeCorruptNotice(), false);
  assert.equal(a.getSnapshot().G0001, 2);
  assert.equal(createCartStore(() => memory()).takeCorruptNotice(), false);
  assert.equal(createCartStore(() => broken).takeCorruptNotice(), false);
  assert.equal(createCartStore(() => null).takeCorruptNotice(), false);
  const m = memory();
  m.data.set(CART_KEY, "{abc");
  const s = createCartStore(() => m);
  s.add("G0001");
  assert.deepEqual(JSON.parse(m.data.get(CART_KEY) ?? "null"), { G0001: 1 });
});

test("cart U-58: 知らせの文言", () => {
  assert.equal(CORRUPT_MESSAGE, "カートを読み込めなかったため、空にしました");
});
