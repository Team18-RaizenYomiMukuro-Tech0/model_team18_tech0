import { REQUEST_TIMEOUT_MS, apiUrl, type Relax, type SceneCount } from "./api.ts";
export type { Relax, SceneCount };
import type { SearchQuery, SortKey } from "./searchQuery.ts";

// D-28 D-29 SP-11 SP-12: 検索結果（R-02）の商品一覧と詳細の取得。budget は送らない。10秒で打ち切る。

// arrives_on（届く日の目安 YYYY-MM-DD）・scene_count は第2弾の新しい項目（D-34）。API 側（D2）が入るまでは来ないので省略可。
// delivery_days が null なら arrives_on も null。scene_count は D-28 に scene を付けたときだけ来る
export type Product = {
  product_id: string;
  name: string;
  price: number;
  category: string;
  rating: number | null;
  review_count: number | null;
  delivery_days: number | null;
  wrapping: boolean | null;
  high_rating: boolean;
  arrives_on?: string | null;
  scene_count?: SceneCount | null;
};
export type ProductDetail = Product & { status: "available" | "out_of_stock"; description: string | null; size: string | null };
export type ProductList = { items: Product[]; count: number; total: number; page: number; page_size: number; relax?: Relax | null };
// D-35 贈った人の声（0〜2件。user_id は返らない）／D-42 似た商品（最大3件。D-28 の1件分と同じ項目）
export type Voice = { text: string; rating: number };
export type VoiceList = { voices: Voice[] };
export type SimilarList = { items: Product[] };

// sort は recommend（既定）のときは付けない（SP-21）。R-02（シーンなし）の取得なので scene は付けない
export function productsUrl(q: Pick<SearchQuery, "priceBand" | "categories" | "page"> & { sort?: SortKey }): string {
  const p = new URLSearchParams();
  if (q.priceBand) p.set("price_band", q.priceBand);
  for (const c of q.categories) p.append("category", c);
  if (q.sort && q.sort !== "recommend") p.set("sort", q.sort);
  if (q.page > 1) p.set("page", String(q.page));
  const s = p.toString();
  return apiUrl(`/api/products${s ? `?${s}` : ""}`);
}

// scene は R-01 から開いた詳細のときだけ付ける（D-29。R-02・おすすめ・お気に入り・カート・共有ページからは付けない）
export function productUrl(id: string, scene?: string | null): string {
  const q = scene ? `?scene=${encodeURIComponent(scene)}` : "";
  return apiUrl(`/api/products/${encodeURIComponent(id)}${q}`);
}

export function voicesUrl(id: string): string {
  return apiUrl(`/api/products/${encodeURIComponent(id)}/voices`);
}

// scene は必須（D-42）。シーンを選んでいない詳細では画面がこの API を呼ばない
export function similarUrl(id: string, scene: string): string {
  return apiUrl(`/api/products/${encodeURIComponent(id)}/similar?scene=${encodeURIComponent(scene)}`);
}

export type Fetched<T> = { status: "ok"; data: T } | { status: "notfound" } | { status: "error" };

// 10秒で打ち切る。404 は notfound、そのほかの失敗（通信・HTTP・形の違う応答）は error
export async function fetchJson<T>(url: string, ok: (v: unknown) => v is T, signal?: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<Fetched<T>> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);
  signal?.addEventListener("abort", () => abort.abort());
  try {
    const res = await fetchImpl(url, { signal: abort.signal });
    if (res.status === 404) return { status: "notfound" };
    if (!res.ok) return { status: "error" };
    const body: unknown = await res.json();
    return ok(body) ? { status: "ok", data: body } : { status: "error" };
  } catch {
    return { status: "error" };
  } finally {
    clearTimeout(timer);
  }
}

export const isProductList = (v: unknown): v is ProductList =>
  typeof v === "object" && v !== null && Array.isArray((v as ProductList).items) && typeof (v as ProductList).total === "number" && typeof (v as ProductList).page === "number";
export const isProductDetail = (v: unknown): v is ProductDetail =>
  typeof v === "object" && v !== null && typeof (v as ProductDetail).name === "string" && typeof (v as ProductDetail).price === "number";

// 0件の文言は選んでいる条件で出し分ける。優先はカテゴリー→価格帯→シーン（#55-2、#56-4）。シーンは R3 で足す
export function emptyMessageR02(q: Pick<SearchQuery, "priceBand" | "categories">): string {
  if (q.categories.length) return "この条件に合う商品がありません。カテゴリーを変えてみてください";
  if (q.priceBand) return "条件に合う商品がありません。価格帯を変えてみてください";
  return "この条件に合う商品がありません。シーンを変えてみてください";
}

// 評価の表示: データの値のまま、丸めない（4.49 は 4.49）。整数の 4 は 4.0（SP-03 の「4.0 は 4.0」）
export function ratingText(r: number): string {
  return Number.isInteger(r) ? r.toFixed(1) : String(r);
}

export const isVoiceList = (v: unknown): v is VoiceList =>
  typeof v === "object" &&
  v !== null &&
  Array.isArray((v as VoiceList).voices) &&
  (v as VoiceList).voices.every((x) => typeof x === "object" && x !== null && typeof x.text === "string" && typeof x.rating === "number");
export const isSimilarList = (v: unknown): v is SimilarList =>
  typeof v === "object" && v !== null && Array.isArray((v as SimilarList).items);

// 404 は notfound（声は商品が無くても 404 にならず [] が来る。似た商品は 404 もある）、そのほかの失敗は error。10秒で打ち切る
export const fetchVoices = (id: string, signal?: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<Fetched<VoiceList>> =>
  fetchJson(voicesUrl(id), isVoiceList, signal, fetchImpl);
export const fetchSimilar = (id: string, scene: string, signal?: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<Fetched<SimilarList>> =>
  fetchJson(similarUrl(id, scene), isSimilarList, signal, fetchImpl);
