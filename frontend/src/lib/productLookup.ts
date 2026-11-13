import { REQUEST_TIMEOUT_MS, apiUrl } from "./api.ts";

// D-30 D-29: お気に入りのパネルが、登録済みの商品IDから名前と価格を取る（GET /api/products/{product_id}。案）。
// 保存は商品IDだけ（D-10）。名前・価格の取り方は文書に書かれていないので、この1か所に閉じ込める。
export type ProductBrief = { product_id: number; name: string; price: number };
export type Lookup = { status: "ok"; product: ProductBrief } | { status: "notfound" } | { status: "error" };

export async function lookupProduct(id: number, fetchImpl: typeof fetch = fetch): Promise<Lookup> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetchImpl(apiUrl(`/api/products/${id}`), { signal: abort.signal });
    if (res.status === 404) return { status: "notfound" };
    if (!res.ok) return { status: "error" };
    const b = (await res.json()) as Partial<ProductBrief>;
    if (typeof b.name !== "string" || typeof b.price !== "number") return { status: "error" };
    return { status: "ok", product: { product_id: id, name: b.name, price: b.price } };
  } catch {
    return { status: "error" };
  } finally {
    clearTimeout(timer);
  }
}
