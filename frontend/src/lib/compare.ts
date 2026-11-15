import { ratingText } from "./products.ts";

// SP-23 D-47 U-76: お気に入りで比べる。選ぶ規則と、表の各項目の文字（値が無ければ「—」。空欄にしない）。
export const COMPARE_MIN = 2;
export const COMPARE_MAX = 3;
export const NONE = "—";
export const UNDER_TWO_MESSAGE = "比べる商品が2件未満になりました";
export const NOTFOUND_MESSAGE = "見つからない商品は比べられません";

// 選ぶ・外す。3 件選んでいる間は 4 件目を足さない（外せば選べる）
export function toggleSelect(selected: readonly string[], id: string): string[] {
  if (selected.includes(id)) return selected.filter((x) => x !== id);
  return selected.length >= COMPARE_MAX ? [...selected] : [...selected, id];
}
export const canSelectMore = (selected: readonly string[]): boolean => selected.length < COMPARE_MAX;
export const canCompare = (n: number): boolean => n >= COMPARE_MIN && n <= COMPARE_MAX;
// 一覧から外れた商品は選択からも外す
export const pruneSelection = (selected: readonly string[], ids: readonly string[]): string[] => selected.filter((x) => ids.includes(x));
export const compareLabel = (n: number): string => (n > 0 ? `比べる（${n}件選択中）` : "比べる");

// 「{M}/{D}までに届く（目安）」（SP-26）。YYYY-MM-DD 以外・無いときは「—」
export function arrivesText(arrivesOn: string | null | undefined): string {
  const m = typeof arrivesOn === "string" ? /^\d{4}-(\d{2})-(\d{2})$/.exec(arrivesOn) : null;
  return m ? `${Number(m[1])}/${Number(m[2])}までに届く（目安）` : NONE;
}
export const wrappingText = (w: boolean | null | undefined): string => (w === true ? "あり" : w === false ? "なし" : NONE);
// 「4.7（120件）」。評価か件数のどちらかが無ければ「—」
export const ratingCell = (rating: number | null | undefined, count: number | null | undefined): string =>
  typeof rating === "number" && typeof count === "number" ? `${ratingText(rating)}（${count}件）` : NONE;
