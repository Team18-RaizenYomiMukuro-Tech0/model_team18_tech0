import { candidatesUrl } from "./api.ts";
import { CATEGORIES } from "./images.ts";
import { productsUrl } from "./products.ts";
import type { SearchQuery } from "./searchQuery.ts";

// D-27 F-19 SP-15 #51-2 #55-1: /search が呼ぶ API の切り替え。
// シーンがあれば GET /api/candidates（R-01 の10件。カテゴリーも選んでいれば、選んだ数だけ category をくり返す）。
// シーンが無ければ GET /api/products（R-02 の12件ずつ。価格帯・カテゴリーがあっても無くても）。どちらも budget は送らない。
export type SearchMode = { mode: "r01" | "r02"; url: string };

export function searchMode(q: Pick<SearchQuery, "scene" | "priceBand" | "categories" | "page">): SearchMode {
  if (q.scene) return { mode: "r01", url: candidatesUrl({ scene: q.scene, priceBand: q.priceBand, categories: q.categories }) };
  return { mode: "r02", url: productsUrl(q) };
}

// 「候補（n件）」の横の説明: 選んだカテゴリーを「・」でつないで全部出す。並びはタイルの並び順（選んだ順にしない。#59-1、#58-7）
export function categoryNote(categories: readonly string[]): string {
  return CATEGORIES.map((c) => c.name)
    .filter((n) => categories.includes(n))
    .join("・");
}
