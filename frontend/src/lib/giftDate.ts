// R8 SP-27 D-46 U-74: 贈る日で間に合うか。画面だけで計算し、保存しない（再読込で消える）。
// 届く日（arrives_on。SP-26）が贈る日と同じか前なら「間に合う（目安）」、後なら「間に合わない（目安）」。
// 贈る日が空・形が違うとき、届く日が無い（配送日数なし）ときは判定を出さない（null）。日付は YYYY-MM-DD の文字の並びで比べる（時計は見ない）。
export const GIFT_DATE_LABEL = "贈る日（任意）";
export const ON_TIME = "間に合う（目安）";
export const TOO_LATE = "間に合わない（目安）";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function giftVerdict(arrivesOn: string | null | undefined, giftDate: string): string | null {
  if (typeof arrivesOn !== "string" || !ISO.test(arrivesOn) || !ISO.test(giftDate)) return null;
  return arrivesOn <= giftDate ? ON_TIME : TOO_LATE;
}
