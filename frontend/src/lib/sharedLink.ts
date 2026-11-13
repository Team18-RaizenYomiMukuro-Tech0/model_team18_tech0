import { REQUEST_TIMEOUT_MS, apiUrl } from "./api.ts";

// SP-06 D-06 D-09 N-01: 共有リンクを開く（GET /api/share-links/{share_id}）。ログインなし。10秒で打ち切る。
// 期限切れ（410）・見つからない（404。形式が不正な識別子も API が 404）・失敗（500・通信・10秒超過・形の違う応答）を区別する。

export type SharedStatus = "available" | "discontinued" | "out_of_stock";
export type SharedItem = { product_id: string; status: SharedStatus; name: string; price: number; reason: string };
export type SharedResult = { status: "ok"; items: SharedItem[] } | { status: "expired" } | { status: "notfound" } | { status: "error" };

export function sharedUrl(shareId: string): string {
  return apiUrl(`/api/share-links/${encodeURIComponent(shareId)}`);
}

const STATUSES: readonly string[] = ["available", "discontinued", "out_of_stock"];

function isItem(v: unknown): v is SharedItem {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.product_id === "string" && typeof o.name === "string" && typeof o.price === "number" && typeof o.reason === "string" && typeof o.status === "string" && STATUSES.includes(o.status);
}

// 販売終了・在庫なしでも、作成時点の商品名・価格は出したまま、この文を足す（#32-5、S-17）
export function itemNote(status: SharedStatus): string | null {
  if (status === "discontinued") return "この商品は販売終了しました";
  if (status === "out_of_stock") return "在庫なし";
  return null;
}

export async function fetchShared(shareId: string, signal?: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<SharedResult> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);
  signal?.addEventListener("abort", () => abort.abort());
  try {
    const res = await fetchImpl(sharedUrl(shareId), { signal: abort.signal });
    if (res.status === 404) return { status: "notfound" };
    if (res.status === 410) return { status: "expired" };
    if (!res.ok) return { status: "error" };
    const body: unknown = await res.json();
    const items = typeof body === "object" && body !== null ? (body as { items?: unknown }).items : undefined;
    return Array.isArray(items) && items.every(isItem) ? { status: "ok", items } : { status: "error" };
  } catch {
    return { status: "error" };
  } finally {
    clearTimeout(timer);
  }
}
