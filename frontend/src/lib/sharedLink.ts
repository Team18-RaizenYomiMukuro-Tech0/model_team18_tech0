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
  win: "ラッキー 7 いいね！", // 数を言う文言（人数ではない。PM 11/19 3B・5個-8 C。#502）
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
// 戻した後の画面の持ち物（U-102）。count が 6 を超えるときだけ count＝6・own＝0（自分の個数も 0 に戻す。保存は変えない。5個-5 A）・failed＝false。6 以下は変えない
export function resetLikeView(v: LikeView): LikeView {
  return v.count > RESET_LIKES.to ? { count: RESET_LIKES.to, own: 0, failed: false } : v;
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
export const likesKey = (shareId: string): string => `giftia:likes:${shareId}`; // 値は商品 ID → 自分の個数（0〜5）の連想配列。昔の形（押した商品 ID の配列）は各 1 個と読む（D-47）

// SP-28 D-09 D-47 1 人 5 個まで（PM 11/19 1A・2A・4A・5個-1〜19。Issue #502）。5 個の数え方はブラウザの中だけ。合計上限 30 はサーバー（N-17）
export const LIKE_PER_BROWSER = 5;
export const LIKE_TOTAL_MAX = 30; // 文言の出し分けだけに使う（守るのはサーバー）
export const LIKE_OWN_FULL_MESSAGE = "5個まで押せます";
export const LIKE_TOTAL_FULL_MESSAGE = "いいねは30個までです";
export const LIKE_MINUS_LABEL = "いいねを1つ減らす";
const isCount = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n);
// 「いいね」を押せるか（U-106）。自分の個数が 0〜4 の整数で、画面の数が 30 未満のときだけ
export function canAddLike(own: unknown, count: unknown): boolean {
  return isCount(own) && own >= 0 && own < LIKE_PER_BROWSER && typeof count === "number" && count < LIKE_TOTAL_MAX;
}
// 「−」を出す・押せるか（U-106）。自分の個数が 1〜5 の整数のときだけ（0 では隠す。5個-3 A）
export function canRemoveLike(own: unknown): boolean {
  return isCount(own) && own >= 1 && own <= LIKE_PER_BROWSER;
}
// 押せないときのボタンのすぐ下の文言（U-87）。合計 30 が先（5 個かつ 30 のときもこちら。5個-13 A）。押せるときは null
export function likeLimitMessage(own: unknown, count: unknown): string | null {
  if (typeof count === "number" && count >= LIKE_TOTAL_MAX) return LIKE_TOTAL_FULL_MESSAGE;
  return isCount(own) && own >= LIKE_PER_BROWSER ? LIKE_OWN_FULL_MESSAGE : null;
}
// 保存の 1 つの値を個数に読む。整数でない値（小数・文字・空・null）は 0、5 より大きい値は 5、0 より小さい値は 0（5個-9 A・5個-18 A）
export function readOwnCount(v: unknown): number {
  return isCount(v) ? Math.min(LIKE_PER_BROWSER, Math.max(0, v)) : 0;
}

export type LikeStorage = { getItem(k: string): string | null; setItem(k: string, v: string): void };
export type LikeView = { count: number; own: number; failed: boolean }; // own＝自分の個数（0〜5）
type PostLike = (shareId: string, productId: string, on: boolean, signal?: AbortSignal) => Promise<LikeResult>;

// 自分の個数の読み出し（D-47）。新しい形は {商品 ID: 個数}、昔の形は商品 ID の配列（各 1 個）。読めない・形の違う値は個数なし（保存が使えなくても画面は出る）
export function loadLikeCounts(storage: LikeStorage | null, shareId: string): Record<string, number> {
  try {
    const v: unknown = JSON.parse(storage?.getItem(likesKey(shareId)) ?? "null");
    const out: Record<string, number> = {};
    if (Array.isArray(v)) {
      for (const x of v) if (typeof x === "string") out[x] = 1;
    } else if (typeof v === "object" && v !== null) {
      for (const [id, n] of Object.entries(v)) {
        const c = readOwnCount(n);
        if (c > 0) out[id] = c;
      }
    }
    return out;
  } catch {
    return {};
  }
}

// 候補ごとのいいね（1 人 5 個まで。D-09・D-47）。add: 自分が 5 個未満・画面の数が 30 未満のときだけ POST（on＝true）→ 成功なら自分の個数 +1・保存・段 8、画面の数は応答の合計に合わせる（12A）。
// 上限（capped）は自分の個数を増やさず、画面の数を応答の合計（30）に合わせる。remove（「−」）: 自分が 1 個以上のときだけ POST（on＝false）→ 成功なら自分の個数 −1・保存。
// 自分が 0 個なら取り消しを送らない（上限で押した人の取り消しで数が減らないように。R3）。失敗・10秒打ち切りは文言を出して押す前に戻す。
export class LikeController {
  private readonly shareId: string;
  private readonly storage: LikeStorage | null;
  private readonly post: PostLike;
  private readonly tracker: Tracker;
  private readonly onChange: (v: Readonly<Record<string, LikeView>>) => void;
  private view: Record<string, LikeView> = {};
  private readonly busy = new Set<string>();
  private readonly afterReset = new Set<string>(); // 「6 個に戻す」を押した商品（画面の中だけ。保存しない。5個-19 A）
  private readonly abort = new AbortController();

  constructor(shareId: string, items: readonly SharedItem[], storage: LikeStorage | null, onChange: (v: Readonly<Record<string, LikeView>>) => void, post: PostLike = postLike, tracker: Tracker = track) {
    this.tracker = tracker;
    this.shareId = shareId;
    this.storage = storage;
    this.post = post;
    this.onChange = onChange;
    const own = loadLikeCounts(storage, shareId);
    for (const it of items) this.view[it.product_id] = { count: it.like_count ?? 0, own: own[it.product_id] ?? 0, failed: false };
  }

  get snapshot(): Readonly<Record<string, LikeView>> {
    return this.view;
  }

  // 「6 個に戻す」（D-09）。画面の数を 6、自分の個数を 0 にする。通信・保存・計測は呼ばない。その商品が応答待ちの間は何もしない（応答後に古い数で上書きされないため）。
  // 戻した商品は「戻した後の 1 回」を持つ（add の成功で使い切る。5個-16 B・5個-19 A）
  reset(productId: string): void {
    const cur = this.view[productId];
    if (cur && !this.busy.has(productId) && canResetLikes(cur.count)) {
      this.set(productId, resetLikeView(cur));
      this.afterReset.add(productId);
    }
  }

  // 戻り値: 出す演出（7＝大当たり・8〜30＝ツッコミ・無し＝null）。数と段 8 を先に確定してから決める（D-09 処理の流れ）
  async add(productId: string): Promise<LikeEffect | null> {
    const cur = this.view[productId];
    if (!cur || this.busy.has(productId) || !canAddLike(cur.own, cur.count)) return null; // 5 個・30 個・応答待ちの連打は送らない
    this.busy.add(productId);
    const r = await this.post(this.shareId, productId, true, this.abort.signal);
    this.busy.delete(productId);
    if (this.abort.signal.aborted) return null;
    if (r.status !== "ok") {
      this.set(productId, { ...cur, failed: true }); // 失敗: 戻した後の 1 回も使い切らない
      return null;
    }
    if (r.capped) {
      this.set(productId, { count: r.like_count, own: cur.own, failed: false }); // 上限: 自分の個数は増やさず、数を応答の合計に合わせる（5個-17 A）
      return null;
    }
    const oneShot = this.afterReset.delete(productId); // 戻した後の最初の成功した 1 回で使い切る
    const countAfter = oneShot ? cur.count + 1 : r.like_count; // 判定の数: 戻した後の 1 回だけ画面の数（6＋1＝7）、ほかは応答の合計（12A）
    this.set(productId, { count: countAfter, own: cur.own + 1, failed: false }); // 戻した後の 1 回は画面の数を 7 のまま（応答に合わせない。5個-19 A）
    this.saveOwn();
    this.tracker(8, { share_id: this.shareId }); // ⑧ 数が増えたときだけ。押した共有ページの share_id（SP-34・輪-2・3。取り消し・上限・失敗は送らない）
    return likeEffect({ on: true, capped: false, countAfter }); // 数と段 8 を先に確定してから判定する（D-09 処理の流れ 2）
  }

  // 戻り値: 7 個目の演出を出すか（add の結果が 7 のとき）
  async toggle(productId: string): Promise<boolean> {
    return (await this.add(productId)) === "seven";
  }

  // 「−」（D-09）。自分が 1 個以上のときだけ POST（on＝false）。成功で自分 −1・保存・数は応答の合計。段 8・演出は呼ばない。「戻した後の 1 回」は消える（5個-19 A）
  async remove(productId: string): Promise<void> {
    const cur = this.view[productId];
    if (!cur || this.busy.has(productId) || !canRemoveLike(cur.own)) return;
    this.afterReset.delete(productId);
    this.busy.add(productId);
    const r = await this.post(this.shareId, productId, false, this.abort.signal);
    this.busy.delete(productId);
    if (this.abort.signal.aborted) return;
    if (r.status !== "ok") {
      this.set(productId, { ...cur, failed: true });
      return;
    }
    this.set(productId, { count: r.like_count, own: cur.own - 1, failed: false });
    this.saveOwn();
  }

  dispose(): void {
    this.abort.abort();
  }

  private set(id: string, v: LikeView): void {
    this.view = { ...this.view, [id]: v };
    this.onChange(this.view);
  }

  private saveOwn(): void {
    try {
      const own: Record<string, number> = {};
      for (const [id, v] of Object.entries(this.view)) if (v.own > 0) own[id] = v.own; // 0 個の商品は書かない（D-47）
      this.storage?.setItem(likesKey(this.shareId), JSON.stringify(own));
    } catch {
      // 保存できなくても押せる（個数は画面を開いている間だけ数える。5個-6 A）
    }
  }
}
