import { SCENES, type Scene } from "./api.ts";
import { CATEGORIES } from "./images.ts";
import { PRICE_BANDS, type PriceBand } from "./priceBand.ts";

// D-26 D-27 キックオフ記録 #85: /search の URL のクエリは GET /api/products（D-28）と同じ名前と値。
// scene・price_band・category（複数は同じ名前をくり返す）・page。おすすめの商品は product=<product_id>（詳細の欄を開く）。
// 値の形が違うもの（範囲外の価格帯・10種類以外のカテゴリー・整数でないページ・商品ID）は無いものとして読む。

// D-43 SP-21: 並び替え。recommend（おすすめ）は既定で URL に付けない。R-01 の10件には使わない
export type SortKey = "recommend" | "price_asc" | "rating_desc" | "delivery_asc";
export const SORTS: readonly { value: SortKey; label: string }[] = [
  { value: "recommend", label: "おすすめ" },
  { value: "price_asc", label: "安い順" },
  { value: "rating_desc", label: "評価順" },
  { value: "delivery_asc", label: "早く届く順" },
];

export type SearchQuery = { scene: Scene | null; priceBand: PriceBand | null; categories: string[]; page: number; product: string | null; sort: SortKey };

const CATEGORY_NAMES: readonly string[] = CATEGORIES.map((c) => c.name);

function idParam(v: string | null): string | null {
  return v !== null && /^[A-Z][0-9]{1,9}$/.test(v) ? v : null; // D-29 と backend の PRODUCT_ID_RE と同じ形
}

function posInt(v: string | null): number | null {
  return v !== null && /^[1-9]\d{0,8}$/.test(v) ? Number(v) : null;
}

export function parseSearchQuery(q: URLSearchParams): SearchQuery {
  const sc = q.get("scene");
  const scene = SCENES.find((s) => s === sc) ?? null;
  const band = q.get("price_band");
  const priceBand = PRICE_BANDS.find((b) => b.value === band)?.value ?? null;
  const categories = [...new Set(q.getAll("category").filter((c) => CATEGORY_NAMES.includes(c)))];
  const sort = SORTS.find((o) => o.value === q.get("sort"))?.value ?? "recommend"; // 4つ以外は既定に戻す
  return { scene, priceBand, categories, page: posInt(q.get("page")) ?? 1, product: idParam(q.get("product")), sort };
}

// 同じ条件のまま、ページや商品だけ替えた URL（ページ送りは同じ条件のまま次の12件。#45-5・6）
export function searchHref(s: SearchQuery, over: Partial<SearchQuery> = {}): string {
  const m = { ...s, ...over };
  const q = new URLSearchParams();
  if (m.scene) q.set("scene", m.scene);
  if (m.priceBand) q.set("price_band", m.priceBand);
  for (const c of m.categories) q.append("category", c);
  if (m.sort !== "recommend") q.set("sort", m.sort);
  if (m.page > 1) q.set("page", String(m.page));
  if (m.product != null) q.set("product", String(m.product));
  const t = q.toString();
  return t ? `/search?${t}` : "/search";
}
