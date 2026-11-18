import { REQUEST_TIMEOUT_MS, apiUrl, postLike, type LikeResult } from "./api.ts";
import { track, type Tracker } from "./tracking.ts";
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
/** SP-06: 共有ページ（表示）の見出しの下にいつも出す固定の案内文（PM 11/18。保存しない・作成者は選べない） */
export const SHARED_GUIDE = "プレゼントの候補を選びました。よいと思うものに『いいね』を押してください。";
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
/** SP-06 D-09（PM 11/18）: 共有ページのいいねボタンの画像と、いいねの数だけ並べる画像の数。5 個まで並べ、6 個目からは「＋N」（N は 5 を超えた分） */
export const LIKE_GIF = "/like-akabu.gif";
export const LIKE_GIF_STILL = "/like-akabu-still.png"; // 動きを減らす設定のときの静止画
export const LIKE_GIF_MAX = 5;
export function likeGifs(count: number): { shown: number; more: number } {
  const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  return { shown: Math.min(n, LIKE_GIF_MAX), more: Math.max(0, n - LIKE_GIF_MAX) };
}

// SP-28 D-09 7 個目の演出「B リーチからの大当たり」（PM 11/19）。値は設計 D-09「7 個目の演出」の表。API・DB・計測は変えない
export const SEVEN_REACH = {
  threshold: 7,
  totalMs: 4700,
  reducedMs: 2000,
  reels: 3,
  symbols: ["7", "akabu", "♥"],
  ringCount: 14,
  bigPx: 220,
  ringPx: 44,
  reach: "リーチ！",
  win: "7 人がいいね！",
  mark: "7 7 7",
  hint: "押すと閉じます",
} as const;
// 演出を出すか（U-100）。押した（on）・上限で止まっていない・押した後に画面が見せる数がちょうど 7。印は持たない（7 になるたびに出す）
export function shouldPlaySevenReach({ on, capped, countAfter }: { on: boolean; capped: boolean; countAfter: unknown }): boolean {
  return on === true && capped === false && typeof countAfter === "number" && countAfter === SEVEN_REACH.threshold;
}
// 動きを減らす設定・動きの API が無い環境は、層を出さず「7 7 7」の印だけ（U-101）
export function sevenReachMode({ reducedMotion, canAnimate }: { reducedMotion: boolean; canAnimate: boolean }): "overlay" | "mark" {
  return reducedMotion || !canAnimate ? "mark" : "overlay";
}
// 動きを減らす版の「7 7 7」は商品ごと（7個目-11）。同じ商品の印が出ている間の押し直しは出し直さない（7個目-14）が、別の商品は出す
export function addSevenMark(marks: readonly string[], id: string): { marks: string[]; start: boolean } {
  return marks.includes(id) ? { marks: [...marks], start: false } : { marks: [...marks, id], start: true };
}
// SP-28 D-09「6 個に戻す」（PM 11/19）。画面の表示だけ戻す。通信・保存・計測は呼ばない
export const RESET_LIKES = { to: 6, minCount: 7, label: "6 個に戻す" } as const;
// ボタンを出すか（U-102）。数が 7 以上の整数のときだけ。is_test は見ない（全員に見せる）
export function canResetLikes(count: unknown): boolean {
  return typeof count === "number" && Number.isInteger(count) && count >= RESET_LIKES.minCount;
}
// 戻した後の画面の持ち物（U-102）。count が 6 を超えるときだけ count＝6・liked＝false（「いいね」に戻す）・failed＝false。6 以下は変えない
export function resetLikeView(v: LikeView): LikeView {
  return v.count > RESET_LIKES.to ? { count: RESET_LIKES.to, liked: false, failed: false } : v;
}

// SP-28 D-09 8 個目以上のツッコミ「B1 ハリセンでスパーン」（PM 11/19）。値は設計 D-09「8 個目以上のツッコミ」「ハリセンの絵」
export const TSUKKOMI = {
  minCount: 8,
  maxCount: 30,
  totalMs: 2450,
  reducedMs: 2000,
  faceBigPx: 110,
  ghosts: 2,
  line: "押しすぎやろ！",
  impact: "スパーン！",
  mark: "押しすぎやろ！",
  hint: "押すと閉じます",
} as const;
// ツッコミを出すか（U-104）。押した（on）・上限で止まっていない・押した後に画面が見せる数が 8 以上 30 以下の整数。7 は大当たりの側（重ねない）
export function shouldPlayTsukkomi({ on, capped, countAfter }: { on: boolean; capped: boolean; countAfter: unknown }): boolean {
  return on === true && capped === false && typeof countAfter === "number" && Number.isInteger(countAfter) && countAfter >= TSUKKOMI.minCount && countAfter <= TSUKKOMI.maxCount;
}
// 動きを減らす設定・動きの API が無い環境は、層を出さず札だけ（U-105）
export function tsukkomiMode({ reducedMotion, canAnimate }: { reducedMotion: boolean; canAnimate: boolean }): "overlay" | "mark" {
  return reducedMotion || !canAnimate ? "mark" : "overlay";
}
/** ハリセンの絵（設計 D-09「ハリセンの絵」。見本 版 5 の harisenSvg）の決まり */
export const HARISEN = {
  width: 150,
  height: 90,
  hub: [128, 45],
  pivot: [150, 45],
  panels: 14,
  light: ["#FFFFFF", "#FBF5E6", "#E9DDBF"],
  shade: ["#E9DCBA", "#D8C59A", "#BFA977"],
  mountLine: { color: "rgba(255,255,255,.95)", width: 1.4 },
  valleyLine: { color: "rgba(90,65,30,.55)", width: 1.1 },
  edge: { color: "#2A2220", width: 2.6 },
  grip: { color: "#D7261E", x: 102, y: 35, w: 48, h: 20, r: 6 },
  tapes: [[110, 35, 116, 55], [124, 35, 130, 55], [138, 35, 144, 55]],
} as const;
/** どちらの演出か（D-09 処理の流れ 2）。大当たり＝7、ツッコミ＝8〜30 */
export type LikeEffect = "seven" | "tsukkomi";
export function likeEffect(a: { on: boolean; capped: boolean; countAfter: unknown }): LikeEffect | null {
  if (shouldPlaySevenReach(a)) return "seven";
  return shouldPlayTsukkomi(a) ? "tsukkomi" : null;
}
export const likeLabel = (liked: boolean): string => (liked ? "いいねした" : "いいね");
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
  private readonly tracker: Tracker;
  private readonly onChange: (v: Readonly<Record<string, LikeView>>) => void;
  private view: Record<string, LikeView> = {};
  private readonly busy = new Set<string>();
  private readonly abort = new AbortController();

  constructor(shareId: string, items: readonly SharedItem[], storage: LikeStorage | null, onChange: (v: Readonly<Record<string, LikeView>>) => void, post: PostLike = postLike, tracker: Tracker = track) {
    this.tracker = tracker;
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

  // 戻り値: 7 個目の演出を出すか（成功して、画面が見せる数がちょうど 7 になったとき。D-09）
  async toggle(productId: string): Promise<boolean> {
    return (await this.toggleEffect(productId)) === "seven";
  }

  // 「6 個に戻す」（D-09）。画面の数だけ 6 にする。通信・保存・計測は呼ばない。その商品が応答待ちの間は何もしない（応答後に古い数で上書きされないため）
  reset(productId: string): void {
    const cur = this.view[productId];
    if (cur && !this.busy.has(productId) && canResetLikes(cur.count)) this.set(productId, resetLikeView(cur));
  }

  // 戻り値: 出す演出（7＝大当たり・8〜30＝ツッコミ・無し＝null）。数と段 8 を先に確定してから決める（D-09 処理の流れ）
  async toggleEffect(productId: string): Promise<LikeEffect | null> {
    const cur = this.view[productId];
    if (!cur || this.busy.has(productId)) return null; // 応答待ちの間の連打は送らない
    this.busy.add(productId);
    const on = !cur.liked;
    const r = await this.post(this.shareId, productId, on, this.abort.signal);
    this.busy.delete(productId);
    if (this.abort.signal.aborted) return null;
    if (r.status !== "ok") this.set(productId, { ...cur, failed: true });
    else if (r.capped) this.set(productId, { ...cur, failed: false }); // 上限: 印も数もそのまま・文言なし
    else {
      const countAfter = Math.max(0, cur.count + (on ? 1 : -1));
      this.set(productId, { count: countAfter, liked: on, failed: false });
      this.saveMarks();
      if (on) this.tracker(8, { share_id: this.shareId }); // ⑧ 数が増えたときだけ。押した共有ページの share_id（SP-34・輪-2・3。取り消し・上限・失敗は送らない）
      return likeEffect({ on, capped: false, countAfter }); // 数と段 8 を先に確定してから判定する（D-09 処理の流れ 2）
    }
    return null;
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
