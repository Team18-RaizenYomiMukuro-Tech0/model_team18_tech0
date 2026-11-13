import type { PriceBand } from "./priceBand.ts";

// D-08 D-01 E-01〜E-03 E-12 #30 J #29-14: 候補の取得（GET /api/candidates）と、10秒の打ち切り。
// 10秒は画面の定数。テストの設定で変えられない（設計.md）。

export const REQUEST_TIMEOUT_MS = 10000;

export type Scene = "お礼" | "誕生日" | "送別";
export const SCENES: readonly Scene[] = ["お礼", "誕生日", "送別"];

// D-01 の応答の1件分（画面が使う分だけ）
export type CandidateItem = {
  product_id: string;
  name: string;
  price: number;
  category: string;
  high_rating: boolean;
  reason: string;
};

// D-16 D-33: API の呼び出し先の頭。公開版は画面と API が別ホストなので、ビルド時の NEXT_PUBLIC_API_BASE を付ける。
// 未設定（空）なら相対パス（手元の開発は next.config.ts の rewrites が /api/* を FastAPI に渡す）。
// 画面から API を呼ぶ所は、必ずこの関数を通す。末尾の / は除く。
export function apiUrl(path: string, base: string | undefined = process.env.NEXT_PUBLIC_API_BASE): string {
  return `${(base ?? "").trim().replace(/\/+$/, "")}${path}`;
}

export type SearchParams = { scene: Scene; priceBand: PriceBand | null; categories?: readonly string[] };

export type SearchState =
  | { status: "initial" }
  | { status: "loading" }
  | { status: "results"; items: CandidateItem[]; count: number }
  | { status: "empty" }
  | { status: "error" };

type FetchLike = (url: string, init: { signal: AbortSignal }) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

// 価格帯を選んでいなければ price_band を付けない（入力エラーにしない。#49-3、#51-2）。budget は送らない
export function candidatesUrl(p: SearchParams): string {
  const q = new URLSearchParams({ scene: p.scene });
  if (p.priceBand) q.set("price_band", p.priceBand);
  for (const c of p.categories ?? []) q.append("category", c); // 選んだ数だけくり返す（#55-1）
  return apiUrl(`/api/candidates?${q.toString()}`);
}

// 検索の実行役。run のたびに「最新の1回」だけが画面に反映される（古い応答は捨てる。AC-11、E-12）。
// 10秒に達したら通信を中止して失敗にする。そのあとに届いた応答は画面に出さない。
export class SearchRunner {
  private token = 0;
  private current: { abort: AbortController; timer: ReturnType<typeof setTimeout> } | null = null;

  private readonly onChange: (s: SearchState) => void;
  private readonly fetchImpl: FetchLike;

  constructor(onChange: (s: SearchState) => void, fetchImpl: FetchLike = (url, init) => fetch(url, init)) {
    this.onChange = onChange;
    this.fetchImpl = fetchImpl;
  }

  run(params: SearchParams): void {
    this.cancel();
    const mine = ++this.token;
    const abort = new AbortController();
    const timer = setTimeout(() => {
      if (mine !== this.token) return;
      this.token++; // これ以降に届く応答は捨てる
      abort.abort();
      this.onChange({ status: "error" });
    }, REQUEST_TIMEOUT_MS);
    this.current = { abort, timer };
    this.onChange({ status: "loading" });
    this.fetchImpl(candidatesUrl(params), { signal: abort.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("bad status");
        const body = (await res.json()) as { items?: CandidateItem[]; count?: number };
        if (mine !== this.token) return;
        clearTimeout(timer);
        const items = Array.isArray(body.items) ? body.items : [];
        this.onChange(items.length ? { status: "results", items, count: body.count ?? items.length } : { status: "empty" });
      })
      .catch(() => {
        if (mine !== this.token) return;
        clearTimeout(timer);
        this.onChange({ status: "error" });
      });
  }

  // 画面を離れるとき・次の検索を始めるときに、前の検索を捨てる
  cancel(): void {
    this.token++;
    if (this.current) {
      clearTimeout(this.current.timer);
      this.current.abort.abort();
      this.current = null;
    }
  }
}

// F3 D-05 D-08 D-15 #30 C・J #41-1: 共有リンクの作成（POST /api/share-links）。
export type ShareLink = { share_id: string; path: string; created_at: string; expires_at: string };

// link は「いま表示しているリンク」。作成中・失敗のときも前のリンクは残す（#41-1。置き換わるのは次の成功のとき）
export type ShareState = { status: "idle" | "creating" | "success" | "error"; link: ShareLink | null };

type PostFetch = (
  url: string,
  init: { method: "POST"; headers: Record<string, string>; body: string; signal: AbortSignal },
) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

export const SHARE_FAILED_MESSAGE = "失敗しました。もう一度お試しください";

// 送るのは商品IDの並びだけ（選んだ順。表示用の情報は送らない。D-05、#41-7）
export function shareRequestBody(productIds: readonly string[]): string {
  return JSON.stringify({ product_ids: [...productIds] });
}

// 画面が今開いているサイトの送信元に API の path をつないだ全体の URL（設計.md「共有リンクの URL の頭」）
export function shareFullUrl(origin: string, path: string): string {
  return `${origin.replace(/\/+$/, "")}${path}`;
}

function isShareLink(v: unknown): v is ShareLink {
  const o = v as Record<string, unknown> | null;
  return !!o && typeof o.share_id === "string" && typeof o.path === "string" && o.path.startsWith("/");
}

// 作成の実行役。作成中の呼び出しは無視する（リンクは1件だけ。S-12）。10秒で打ち切って失敗にし、
// そのあとに届いた応答は捨てる（サーバー側で作られることは許す。#30 C・J）。
export class ShareLinkRunner {
  private creating = false;
  private token = 0;
  private link: ShareLink | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private abort: AbortController | null = null;

  private readonly onChange: (s: ShareState) => void;
  private readonly fetchImpl: PostFetch;

  constructor(onChange: (s: ShareState) => void, fetchImpl: PostFetch = (url, init) => fetch(url, init)) {
    this.onChange = onChange;
    this.fetchImpl = fetchImpl;
  }

  create(productIds: readonly string[]): void {
    if (this.creating) return;
    this.creating = true;
    const mine = ++this.token;
    const abort = new AbortController();
    this.abort = abort;
    const finish = (s: ShareState) => {
      if (mine !== this.token) return;
      this.token++;
      this.creating = false;
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
      if (s.link) this.link = s.link;
      this.onChange(s);
    };
    this.timer = setTimeout(() => {
      abort.abort();
      finish({ status: "error", link: this.link });
    }, REQUEST_TIMEOUT_MS);
    this.onChange({ status: "creating", link: this.link });
    this.fetchImpl(apiUrl("/api/share-links"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: shareRequestBody(productIds),
      signal: abort.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("bad status");
        const body = await res.json();
        if (!isShareLink(body)) throw new Error("bad body");
        finish({ status: "success", link: body });
      })
      .catch(() => finish({ status: "error", link: this.link }));
  }

  // 画面を離れるとき: 届く応答は捨てる
  cancel(): void {
    this.token++;
    this.creating = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.abort?.abort();
  }
}
