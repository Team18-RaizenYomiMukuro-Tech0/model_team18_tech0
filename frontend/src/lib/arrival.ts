// F-44・SP-26: 届く日（目安）の文言。日付はサーバーが日本時間で計算して返す（`arrives_on`＝YYYY-MM-DD。D-34）ので、画面では足し算も
// 時計の参照もしない。形が違う値・null・無いときは出さない（null を返す）。文言は「{M}/{D}までに届く（目安）」（月・日は 0 を付けない）
export function arrivesText(arrivesOn: string | null | undefined): string | null {
  const m = typeof arrivesOn === "string" ? /^\d{4}-(\d{2})-(\d{2})$/.exec(arrivesOn) : null;
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${month}/${day}までに届く（目安）`;
}
