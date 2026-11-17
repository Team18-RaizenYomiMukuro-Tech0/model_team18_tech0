// R8 SP-27 D-46 U-74: 贈る日で間に合うか。画面だけで計算し、保存しない（再読込で消える）。
// 届く日（arrives_on。SP-26）が贈る日と同じか前なら「間に合う（目安）」、後なら「間に合わない（目安）」。
// 贈る日が空・形が違うとき、届く日が無い（配送日数なし）ときは判定を出さない（null）。日付は YYYY-MM-DD の文字の並びで比べる（時計は見ない）。
export const GIFT_DATE_LABEL = "贈る日（任意）";
export const ON_TIME = "間に合う（目安）";
export const TOO_LATE = "間に合わない（目安）";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

// today（YYYY-MM-DD）を渡すと、今日より前の贈る日（手で打った過去の日。SP-27「今日より前は選べない」）は判定しない（#390）
export function giftVerdict(arrivesOn: string | null | undefined, giftDate: string, today?: string): string | null {
  if (typeof arrivesOn !== "string" || !ISO.test(arrivesOn) || !ISO.test(giftDate)) return null;
  if (today !== undefined && giftDate < today) return null;
  return arrivesOn <= giftDate ? ON_TIME : TOO_LATE;
}

// 贈る日の入力の初期値は空（PM 決定 2026-11-17 の 3。11/16 の 1B を変更）。空なら判定は出ない。
export const GIFT_DATE_INITIAL = "";

// 贈る日の入力の min（今日より前は選べない。SP-27）: ブラウザの今日（端末の日付）を YYYY-MM-DD で返す。
export function todayLocal(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
