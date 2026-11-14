import { useSyncExternalStore } from "react";
import { track } from "../lib/tracking.ts";
import { cartNotice, type NoticeController } from "./cartNotice.ts";

// D-31 D-10 SP-14 F-17 U-44 #50-5 #51-3 #53-4 #54-9 #56-3: カート。ブラウザ内の保存（localStorage、キー giftia:cart）だけを使う。
// 中身は {商品ID: 数量}。数量は 1〜99。サーバーには何も送らない。保存の読み書きは例外を握る（使えない環境でも画面が壊れない）。
// お気に入り（state/favorites.ts）と同じ作り: すべての画面の部品は同じ store を見るので同期する。

export const CART_KEY = "giftia:cart";
export const QTY_MIN = 1;
export const QTY_MAX = 99;
export const ORDER_DEMO_MESSAGE = "デモのため、注文はできません";

export type Cart = Readonly<Record<string, number>>;
export type StoreLike = { getItem(k: string): string | null; setItem(k: string, v: string): void };

const clamp = (n: number): number => Math.min(QTY_MAX, Math.max(QTY_MIN, n));

// 数量の欄を離れた時点の判定（blur）。入力 raw と直前の数量 prev から、次の数量を返す。
// 全角の数字・マイナスは半角に直す。「１2」のような混在も全部半角に直して受け付ける（#54-9、#56-3）。
// 整数: 100 以上は 99、0 以下は 1。空・小数（全角の「１．５」も小数）・数字以外は直前の数量に戻す（#53-4、#56-3）。
export function normalizeQty(raw: string, prev: number): number {
  const half = raw
    .trim()
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[－−]/g, "-");
  if (!/^-?\d+$/.test(half)) return prev; // 空・小数点・文字・符号だけ
  const n = Number(half);
  return clamp(Number.isFinite(n) ? n : QTY_MAX);
}

// 保存の読み出し。壊れた値（JSON として読めない・オブジェクトでない）は corrupt=true で空として返す（SP-14 ④）。
// 保存が使えない・まだ何も無いのは壊れたのではない（corrupt=false）。数量は整数だけ 1〜99 に収めて残し、それ以外の項目は捨てる
export function readCart(storage: StoreLike | null): { cart: Cart; corrupt: boolean } {
  let raw: string | null | undefined;
  try {
    raw = storage?.getItem(CART_KEY);
  } catch {
    return { cart: {}, corrupt: false }; // 保存を使えない
  }
  if (!raw) return { cart: {}, corrupt: false };
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== "object" || v === null || Array.isArray(v)) return { cart: {}, corrupt: true };
    const out: Record<string, number> = {};
    for (const [id, q] of Object.entries(v)) if (id !== "" && typeof q === "number" && Number.isInteger(q)) out[id] = clamp(q);
    return { cart: out, corrupt: false };
  } catch {
    return { cart: {}, corrupt: true };
  }
}

export const loadCart = (storage: StoreLike | null): Cart => readCart(storage).cart;

// ＋／− ボタン（SP-14 ①）。1 で − は押せない、99 で ＋ は押せない
export const canDecrease = (qty: number): boolean => qty > QTY_MIN;
export const canIncrease = (qty: number): boolean => qty < QTY_MAX;
export const stepQty = (qty: number, delta: 1 | -1): number => clamp(qty + delta);

// ヘッダーのカートの数は、入っている商品の種類の数（数量の合計ではない）（SP-08、U-54）
export const cartCount = (cart: Cart): number => Object.keys(cart).length;

export function saveCart(storage: StoreLike | null, cart: Cart): void {
  try {
    storage?.setItem(CART_KEY, JSON.stringify(cart));
  } catch {
    // 保存できなくても、画面の状態はそのまま使える（止めない）
  }
}

// 開いたときに詳細 API（D-29）で確かめた結果（D-31）。ok かつ available だけが合計に入る
export type CartInfo = { status: "ok"; price: number; stock: "available" | "out_of_stock" } | { status: "notfound" } | { status: "error" };

// 合計（税込）。販売終了（404）・在庫なし・まだ確かめられていない商品は入れない（#50-4、#51-3、#53-5）
export function cartTotal(cart: Cart, info: Readonly<Record<string, CartInfo | undefined>>): number {
  let sum = 0;
  for (const [id, q] of Object.entries(cart)) {
    const i = info[id];
    if (i?.status === "ok" && i.stock === "available") sum += i.price * q;
  }
  return sum;
}

export type CartStore = {
  subscribe: (cb: () => void) => () => void;
  getSnapshot: () => Cart;
  add: (id: string) => void;
  setQty: (id: string, qty: number) => void;
  remove: (id: string) => void;
  // 保存が壊れていて空にしたとき、1回だけ true を返す（SP-14 ④）。画面を移っても、再読み込みしても繰り返さない
  takeCorruptNotice: () => boolean;
};

// storage は関数で渡す（保存が使えないとき null を返す）。読み出しは最初に使うときの1回
// notice を渡すと、追加のたびに「カートに入れました」を出す（SP-14 ③）
// onAdd は追加のたびに呼ぶ（④ カートに入れたとき。どこから入れても。計測 SP-34）
export function createCartStore(getStorage: () => StoreLike | null, notice?: NoticeController, onAdd?: () => void): CartStore {
  let cart: Cart | null = null;
  let corruptPending = false;
  const listeners = new Set<() => void>();
  const current = (): Cart => {
    if (cart === null) {
      const r = readCart(getStorage());
      cart = r.cart;
      if (r.corrupt) {
        saveCart(getStorage(), cart); // 空のカートとして保存し直す（次からは壊れていない）
        corruptPending = true;
      }
    }
    return cart;
  };
  const set = (next: Cart) => {
    cart = next;
    saveCart(getStorage(), next);
    listeners.forEach((l) => l());
  };
  return {
    subscribe: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getSnapshot: current,
    add: (id) => {
      set({ ...current(), [id]: clamp((current()[id] ?? 0) + 1) }); // 同じ商品は数量+1（2件にならない）。99 を超えない
      notice?.show("added");
      onAdd?.();
    },
    takeCorruptNotice: () => {
      current();
      const p = corruptPending;
      corruptPending = false;
      return p;
    },
    setQty: (id, qty) => {
      if (id in current()) set({ ...current(), [id]: clamp(Math.trunc(qty)) });
    },
    remove: (id) => {
      if (!(id in current())) return;
      const { [id]: _, ...rest } = current(); // eslint-disable-line @typescript-eslint/no-unused-vars
      set(rest);
    },
  };
}

function browserStorage(): StoreLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null; // 保存を使えない状態（アクセスで例外）
  }
}

export const cartStore = createCartStore(browserStorage, cartNotice, () => track(4));

const EMPTY: Cart = {};

// 画面から使う入口。サーバーでの描画は空、ブラウザで保存を読む（ハイドレーションの食い違いを避ける）
export function useCart() {
  const cart = useSyncExternalStore(cartStore.subscribe, cartStore.getSnapshot, () => EMPTY);
  const ids = Object.keys(cart);
  return { cart, ids, count: cartCount(cart), add: cartStore.add, setQty: cartStore.setQty, remove: cartStore.remove };
}
