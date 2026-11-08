// SP-01 D-01 #49-1〜3: 価格帯の3つのボタン（任意。同じボタンの再押下で解除）。金額の入力欄は無い。
export type PriceBand = "under3000" | "3000to4999" | "5000plus";

// ボタンの文字は「3,000〜4,999円」（「3,000〜5,000円」ではない。#49-2）。値は API の price_band と同じ（D-01）
export const PRICE_BANDS: readonly { value: PriceBand; label: string }[] = [
  { value: "under3000", label: "〜2,999円" },
  { value: "3000to4999", label: "3,000〜4,999円" },
  { value: "5000plus", label: "5,000円〜" },
];

// 押したボタンを受けて、次の選択を返す。初期は null（未選択）。別のボタンで切り替わり、同じボタンで null に戻る
export function togglePriceBand(current: PriceBand | null, clicked: PriceBand): PriceBand | null {
  return current === clicked ? null : clicked;
}
