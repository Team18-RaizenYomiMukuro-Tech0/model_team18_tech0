import { RECENT_KEY, addRecent, parseRecent, removeRecent } from "../lib/recent.ts";

// R8 SP-22 D-47: 最近見た商品の保存（localStorage `giftia:recent`）。読み書きは例外を握る。保存が使えないときは何も入らず、欄も出ない。
// お気に入り・カートと同じ作り: すべての画面の部品は同じ store を見る（useSyncExternalStore）。snapshot は保存の文字列（変わったときだけ別の値）。
const listeners = new Set<() => void>();

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
function read(): string[] {
  try {
    return parseRecent(storage()?.getItem(RECENT_KEY));
  } catch {
    return [];
  }
}
function write(list: string[]): void {
  try {
    storage()?.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    return; // 保存できない（私的なウィンドウなど）。画面は今までどおり出る
  }
  listeners.forEach((l) => l());
}

export const recentStore = {
  add(id: string): void {
    write(addRecent(read(), id));
  },
  remove(id: string): void {
    const cur = read();
    if (cur.includes(id)) write(removeRecent(cur, id));
  },
  subscribe(cb: () => void): () => void {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  /** 保存の文字列。同じ中身なら同じ値を返す（useSyncExternalStore の決まり） */
  getSnapshot(): string {
    return read().join(",");
  },
  getServerSnapshot(): string {
    return "";
  },
};
