import type { PriceBand } from "./priceBand.ts";
import type { Scene } from "./api.ts";

// D-26 SP-09 #50-1 #51-1 #53-1 #53-3 #54-5 #54-8 #61: トップの組み立てロジック（React を使わない純粋な部分）。

export const RECOMMEND_COUNT = 4; // おすすめは条件なしの先頭4件（#53-1）

export type SearchTarget = { scene?: Scene | null; priceBand?: PriceBand | null; category?: string | null; productId?: number | null };

// 検索結果 `/search` へ渡す条件の組み立て。設計 D-26 に書いてあるのは category と price_band。
// scene と product のクエリ名は文書に無く、案（API の名前と同じ scene、商品は product）。変えるのはこの1か所だけ。
export function buildSearchHref(t: SearchTarget): string {
  const q = new URLSearchParams();
  if (t.scene) q.set("scene", t.scene);
  if (t.priceBand) q.set("price_band", t.priceBand);
  if (t.category) q.set("category", t.category);
  if (t.productId != null) q.set("product", String(t.productId));
  const s = q.toString();
  return s ? `/search?${s}` : "/search";
}

// 価格帯のボタンを押したときの動き（#51-1）。シーン未選択なら選ぶだけで移らない。シーンを選んでいれば条件つきで移る
export function onBandPress(scene: Scene | null, band: PriceBand | null): { navigateTo: string | null } {
  return { navigateTo: scene ? buildSearchHref({ scene, priceBand: band }) : null };
}

// 「この価格帯の商品を見る」のリンク（#53-3、#54-8）。シーン未選択で価格帯を選んでいるときだけ出す。押すと R-02 の12件ずつへ
export function bandLinkHref(scene: Scene | null, band: PriceBand | null): string | null {
  return !scene && band ? buildSearchHref({ priceBand: band }) : null;
}

// カテゴリーの開閉ボタン（480px 以下）。閉じていれば aria-expanded=false・印 ▼、開いていれば true・▲（#61、#62-1）
export function categoryToggle(open: boolean): { expanded: boolean; mark: "▼" | "▲" } {
  return { expanded: open, mark: open ? "▲" : "▼" };
}

// おすすめ: GET /api/products を条件なしで呼んだ先頭4件（D-26）
export type RecommendedItem = { product_id: number; name: string; price: number; category: string; rating: number | null; review_count: number | null; high_rating: boolean };
export function pickRecommended(items: readonly RecommendedItem[]): RecommendedItem[] {
  return items.slice(0, RECOMMEND_COUNT);
}
