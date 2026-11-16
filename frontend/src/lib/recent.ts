// R8 SP-22 D-47 U-75: 最近見た商品。保存は商品 ID の配列（新しい順、最大 6 件）だけ（localStorage `giftia:recent`）。React を使わない純粋な部分。
export const RECENT_KEY = "giftia:recent";
export const RECENT_MAX = 6;
export const RECENT_HEADING = "最近見た商品";
export const RECENT_FAILED = "最近見た商品を読み込めませんでした";
const ID = /^[A-Z][0-9]{1,9}$/;

/** 保存の中身（JSON の配列）を読む。壊れた値・形の違う ID は捨てる。同じ ID は先頭のものだけ。最大 6 件 */
export function parseRecent(raw: string | null | undefined): string[] {
  if (!raw) return [];
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) if (typeof x === "string" && ID.test(x) && !out.includes(x)) out.push(x);
  return out.slice(0, RECENT_MAX);
}

/** 詳細が出た商品を先頭に入れる。同じ商品は 1 件にまとめて先頭へ。7 件目を入れたら一番古いものが消える */
export function addRecent(list: readonly string[], id: string): string[] {
  if (!ID.test(id)) return [...list];
  return [id, ...list.filter((x) => x !== id)].slice(0, RECENT_MAX);
}

export function removeRecent(list: readonly string[], id: string): string[] {
  return list.filter((x) => x !== id);
}
