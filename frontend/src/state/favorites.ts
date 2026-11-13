import { useSyncExternalStore } from "react";

// D-30 D-10 SP-13 F-15 #46-6 #45-7: お気に入り。ブラウザ内の保存（localStorage、キー giftia:favorites）だけを使う。
// 中身は商品IDの配列（重複しない）。サーバーには何も送らない。保存の読み書きは例外を握る（使えない環境でも画面が壊れない）。
// すべてのハート・パネルは同じ store を見るので同期する。

export const FAVORITES_KEY = "giftia:favorites";

export type StoreLike = { getItem(k: string): string | null; setItem(k: string, v: string): void };

// 保存の読み出し。壊れた値・使えない保存は空として扱う。商品IDは正の整数だけ、重複は除く（最初の出現順）
export function loadFavorites(storage: StoreLike | null): number[] {
  try {
    const raw = storage?.getItem(FAVORITES_KEY);
    if (!raw) return [];
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    const out: number[] = [];
    for (const x of v) if (typeof x === "number" && Number.isInteger(x) && x > 0 && !out.includes(x)) out.push(x);
    return out;
  } catch {
    return [];
  }
}

export function saveFavorites(storage: StoreLike | null, ids: readonly number[]): void {
  try {
    storage?.setItem(FAVORITES_KEY, JSON.stringify(ids));
  } catch {
    // 保存できなくても、画面の状態はそのまま使える（止めない）
  }
}

export type FavoritesStore = {
  subscribe: (cb: () => void) => () => void;
  getSnapshot: () => readonly number[];
  has: (id: number) => boolean;
  add: (id: number) => void;
  remove: (id: number) => void;
  toggle: (id: number) => void;
};

// storage は関数で渡す（保存が使えないとき null を返す）。読み出しは最初に使うときの1回
export function createFavoritesStore(getStorage: () => StoreLike | null): FavoritesStore {
  let ids: readonly number[] | null = null;
  const listeners = new Set<() => void>();
  const current = (): readonly number[] => (ids ??= loadFavorites(getStorage()));
  const set = (next: readonly number[]) => {
    ids = next;
    saveFavorites(getStorage(), next);
    listeners.forEach((l) => l());
  };
  return {
    subscribe: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getSnapshot: current,
    has: (id) => current().includes(id),
    add: (id) => {
      if (!current().includes(id)) set([...current(), id]); // 同じ商品は1件のまま
    },
    remove: (id) => {
      if (current().includes(id)) set(current().filter((x) => x !== id));
    },
    toggle: (id) => (current().includes(id) ? set(current().filter((x) => x !== id)) : set([...current(), id])),
  };
}

function browserStorage(): StoreLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null; // 保存を使えない状態（アクセスで例外）
  }
}

export const favoritesStore = createFavoritesStore(browserStorage);

const EMPTY: readonly number[] = [];

// 画面から使う入口。サーバーでの描画は空、ブラウザで保存を読む（ハイドレーションの食い違いを避ける）
export function useFavorites() {
  const ids = useSyncExternalStore(favoritesStore.subscribe, favoritesStore.getSnapshot, () => EMPTY);
  return { ids, has: (id: number) => ids.includes(id), toggle: favoritesStore.toggle, remove: favoritesStore.remove, add: favoritesStore.add };
}
