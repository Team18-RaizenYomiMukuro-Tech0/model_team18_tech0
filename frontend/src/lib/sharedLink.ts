import { REQUEST_TIMEOUT_MS, apiUrl, postLike, type LikeResult } from "./api.ts";
import { productImage } from "./images.ts";
import { buildSearchHref } from "./topPage.ts";

// SP-06 D-06 D-09 N-01: 共有リンクを開く（GET /api/share-links/{share_id}）。ログインなし。10秒で打ち切る。
// 期限切れ（410）・見つからない（404。形式が不正な識別子も API が 404）・失敗（500・通信・10秒超過・形の違う応答）を区別する。

export type SharedStatus = "available" | "discontinued" | "out_of_stock";
// like_count は第2弾の応答で付く（無ければ 0。第1弾で作ったリンクも 0 から押せる。SP-28）
// category は第2弾の応答で付く（商品が DB に無い・カテゴリーが空のときは無い。画像なし。PM 11/15 案A、D-06）
export type SharedItem = { product_id: string; status: SharedStatus; name: string; price: number; reason: string; like_count?: number; category?: string };
export type SharedResult = { status: "ok"; items: SharedItem[] } | { status: "expired" } | { status: "notfound" } | { status: "error" };

export function sharedUrl(shareId: string): string {
  return apiUrl(`/api/share-links/${encodeURIComponent(shareId)}`);
}

const STATUSES: readonly string[] = ["available", "discontinued", "out_of_stock"];

function isItem(v: unknown): v is SharedItem {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.product_id === "string" && typeof o.name === "string" && typeof o.price === "number" && typeof o.reason === "string" && (o.like_count === undefined || typeof o.like_count === "number") && (o.category === undefined || typeof o.category === "string") && typeof o.status === "string" && STATUSES.includes(o.status);
}

// 販売終了・在庫なしでも、作成時点の商品名・価格は出したまま、この文を足す（#32-5、S-17）
export function itemNote(status: SharedStatus): string | null {
  if (status === "discontinued") return "この商品は販売終了しました";
  if (status === "out_of_stock") return "在庫なし";
  return null;
}

// 第2弾 F-33 SP-06 K-6: 「くわしく見る」は検索結果の詳細の欄へ（/search?product=…）。販売終了の候補（商品が DB に無い）には置かない。在庫なしには置く
export const DETAIL_LABEL = "くわしく見る";
export const OTHERS_LABEL = "ほかの贈りものも探す";
export const OTHERS_HREF = "/"; // トップへ
// 画像（カテゴリー共通イラスト＋「イメージ」）。category が無い・知らないカテゴリーなら画像なし
export const itemImage = (it: { category?: string }): string | null => (it.category ? productImage(it.category) : null);
export const canShowDetail = (status: SharedStatus): boolean => status !== "discontinued";
export const detailHref = (productId: string): string => buildSearchHref({ productId });

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

// ---- いいね（第2弾 F-34 SP-28 D-39 D-47 N-17）----
export const LIKE_FAILED_MESSAGE = "いいねできませんでした。もう一度お試しください";
export const likeLabel = (liked: boolean): string => (liked ? "♥ いいねした" : "♡ いいね");
export const likesKey = (shareId: string): string => `giftia:likes:${shareId}`; // 値は押した商品 ID の配列（D-47）

export type LikeStorage = { getItem(k: string): string | null; setItem(k: string, v: string): void };
export type LikeView = { count: number; liked: boolean; failed: boolean };
type PostLike = (shareId: string, productId: string, on: boolean, signal?: AbortSignal) => Promise<LikeResult>;

// 押した印の読み出し。読めない・形の違う値は印なし（保存が使えなくても画面は出る）
export function loadLikedIds(storage: LikeStorage | null, shareId: string): string[] {
  try {
    const v: unknown = JSON.parse(storage?.getItem(likesKey(shareId)) ?? "null");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

// 候補ごとのいいね。押す→POST→成功なら数を ±1（0 を下回らない）と印。上限（capped）は印も数もそのまま。
// 印が無い候補は取り消しを送らない（上限で押した人の取り消しで数が減らないように。R3）。失敗・10秒打ち切りは文言を出して押す前に戻す。
export class LikeController {
  private readonly shareId: string;
  private readonly storage: LikeStorage | null;
  private readonly post: PostLike;
  private readonly onChange: (v: Readonly<Record<string, LikeView>>) => void;
  private view: Record<string, LikeView> = {};
  private readonly busy = new Set<string>();
  private readonly abort = new AbortController();

  constructor(shareId: string, items: readonly SharedItem[], storage: LikeStorage | null, onChange: (v: Readonly<Record<string, LikeView>>) => void, post: PostLike = postLike) {
    this.shareId = shareId;
    this.storage = storage;
    this.post = post;
    this.onChange = onChange;
    const liked = new Set(loadLikedIds(storage, shareId));
    for (const it of items) this.view[it.product_id] = { count: it.like_count ?? 0, liked: liked.has(it.product_id), failed: false };
  }

  get snapshot(): Readonly<Record<string, LikeView>> {
    return this.view;
  }

  async toggle(productId: string): Promise<void> {
    const cur = this.view[productId];
    if (!cur || this.busy.has(productId)) return; // 応答待ちの間の連打は送らない
    this.busy.add(productId);
    const on = !cur.liked;
    const r = await this.post(this.shareId, productId, on, this.abort.signal);
    this.busy.delete(productId);
    if (this.abort.signal.aborted) return;
    if (r.status !== "ok") this.set(productId, { ...cur, failed: true });
    else if (r.capped) this.set(productId, { ...cur, failed: false }); // 上限: 印も数もそのまま・文言なし
    else {
      this.set(productId, { count: Math.max(0, cur.count + (on ? 1 : -1)), liked: on, failed: false });
      this.saveMarks();
    }
  }

  dispose(): void {
    this.abort.abort();
  }

  private set(id: string, v: LikeView): void {
    this.view = { ...this.view, [id]: v };
    this.onChange(this.view);
  }

  private saveMarks(): void {
    try {
      const ids = Object.keys(this.view).filter((id) => this.view[id].liked);
      this.storage?.setItem(likesKey(this.shareId), JSON.stringify(ids));
    } catch {
      // 保存できなくても押せる（印は残らない）
    }
  }
}
