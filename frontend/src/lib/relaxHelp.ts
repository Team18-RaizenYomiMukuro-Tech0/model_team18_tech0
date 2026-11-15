// R7 SP-24 D-44 U-77: 0 件のときの助け舟。選んでいる条件だけ「価格帯をはずすと N 件」「カテゴリーをはずすと N 件」をこの順に出す。
// N が 0 の行・選んでいない条件の行・応答に relax が無いとき（件数が取れなかった）は出さない（今の 0 件の文言だけ）。
import type { Relax } from "./api.ts";
import type { SearchQuery } from "./searchQuery.ts";

export type RelaxRow = { key: "price_band" | "category" | "no_q"; text: string; next: SearchQuery };

export function relaxRows(q: SearchQuery, relax: Relax | null | undefined): RelaxRow[] {
  if (!relax) return [];
  const rows: RelaxRow[] = [];
  const n = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;
  // はずした条件で出し直す（ページは 1 に戻す。シーン・並びはそのまま）
  if (q.priceBand !== null && n(relax.price_band)) rows.push({ key: "price_band", text: `価格帯をはずすと ${relax.price_band} 件`, next: { ...q, priceBand: null, page: 1 } });
  if (q.categories.length > 0 && n(relax.category)) rows.push({ key: "category", text: `カテゴリーをはずすと ${relax.category} 件`, next: { ...q, categories: [], page: 1 } });
  // D-49 SP-35 ⑥: 言葉を付けて 0 件のとき、言葉だけをはずした件数。条件（シーン・価格帯・カテゴリー）と並びはそのまま
  if (q.q !== "" && n(relax.no_q)) rows.push({ key: "no_q", text: `言葉をはずすと ${relax.no_q} 件`, next: { ...q, q: "", page: 1 } });
  return rows;
}
