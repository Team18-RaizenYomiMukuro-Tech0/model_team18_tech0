// 固定データ（テスト設計 FD-1・FD-10）から、描画テストで使う商品だけを写す。
import type { CandidateItem } from "@/lib/api";
import type { ProductDetail } from "@/lib/products";

// FD-1 P01: 送別・4,999 円・評価 4.5・件数 20・送別で 12 回・2 日 / ラッピング可
export const P01: CandidateItem = {
  product_id: "P01",
  name: "送別の焼き菓子セット",
  price: 4999,
  category: "食品",
  high_rating: true,
  rating: 4.7,
  review_count: 120,
  reason: "評価が高く、送別で何度も選ばれています",
  delivery_days: 2,
  wrapping: true,
  arrives_on: "2026-11-27",
  scene_count: { scene: "送別", n: 12 },
};

export const candidate = (id: string, over: Partial<CandidateItem> = {}): CandidateItem => ({
  ...P01,
  product_id: id,
  name: `商品${id}`,
  rating: null,
  review_count: null,
  scene_count: null,
  high_rating: false,
  ...over,
});

// FD-10 C1: 食品・3,200 円・特徴とセット内容あり。詳細（GET /api/products/{id}）の偽の応答
export const C1: ProductDetail = {
  product_id: "C1",
  name: "季節の和菓子詰め合わせ",
  price: 3200,
  category: "食品",
  rating: 4.5,
  review_count: 20,
  delivery_days: 2,
  wrapping: true,
  high_rating: true,
  arrives_on: "2026-11-27",
  scene_count: null,
  status: "available",
  description: "手づくりの和菓子を季節ごとに詰めました",
  size: "和菓子 8 個入り",
};
export const detail = (id: string, over: Partial<ProductDetail> = {}): ProductDetail => ({ ...C1, product_id: id, name: `商品${id}`, ...over });
