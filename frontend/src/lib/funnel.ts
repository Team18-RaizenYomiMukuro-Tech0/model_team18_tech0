// D-41 SP-34 U-80: 通過率の計算（運用の SELECT と同じ式）。各段の通過率＝「その段の記録が1件以上ある訪問の数 ÷ ①の訪問の数」。
// 同じ段の重複は1回に数える。段の順番は見ない（記録が1件以上あればよい。ADR-011）。段7（0件）は漏斗の外なので数えない。
// ①が0件なら0で割らず null（画面・表では「—」）。1訪問＝その訪問で記録された段の並び。

export const FUNNEL_STEPS = [1, 2, 3, 4, 5, 6] as const;
export type FunnelRow = { step: number; visits: number; rate: number | null };

export function funnelRates(visits: readonly (readonly number[])[]): FunnelRow[] {
  const sets = visits.map((v) => new Set(v));
  const first = sets.filter((s) => s.has(1)).length;
  return FUNNEL_STEPS.map((step) => {
    const n = sets.filter((s) => s.has(step)).length;
    return { step, visits: n, rate: first === 0 ? null : n / first };
  });
}
