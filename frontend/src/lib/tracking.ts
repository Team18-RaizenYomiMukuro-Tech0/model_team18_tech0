import { apiUrl, type Scene } from "./api.ts";

// SP-34 D-40 D-47 N-16 U-79 U-81: 計測の送り口。訪問の印（visit_id）・匿名の訪問者 ID（visitor_id）・30分の区切り・本文を作る関数・送る関数。
// どこから呼ぶか（①サイトに来る ②検索結果 ③詳細 ④カート ⑤共有リンク ⑥注文へ進む ⑦0件）は D7（#284）・R8・D9 が決める。ここは「送る道具」だけ。
// 送らないもの: 名前・メール・IP アドレス・ブラウザの情報・商品 ID・検索語・ユーザー ID（N-13）。保存できないときは送らない（D-47）。

export const VISIT_GAP_MS = 30 * 60 * 1000; // 30分以上あいたら新しい訪問（now - last_at >= 30分。K-4）
export const VISITOR_KEY = "giftia:visitor";
export const VISIT_KEY = "giftia:visit";
export const TEST_KEY_STORE = "giftia:test_key"; // sessionStorage（K-5。テストの訪問の印）
export const TEST_KEY_MAX = 64;
export const TEST_QUERY = "giftia_test";

// 1〜6は漏斗の段（①来る ②検索結果 ③詳細 ④カートに入れる ⑤共有リンクを作る ⑥注文へ進む）、7は検索が0件、8は共有ページでいいねを押した（7・8は漏斗の外。D-40）
export type EventStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type EventEntry = "top" | "search" | "detail" | "share" | "cart" | "favorites" | "other";
export type ZeroCond = "price" | "category" | "both" | "scene_only";
// share_id は段5（作ったリンク。輪-1）と段8（いいねを押した共有ページ。輪-2）だけが呼び出し側から渡す。段1〜4・6 は訪問の share_id（Ids）から入る
export type EventExtra = { scene?: Scene | null; has_voice?: boolean; entry?: EventEntry; zero_cond?: ZeroCond; share_id?: string };
export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
// fresh: この呼び出しで新しい訪問を作った。shareId: 共有ページから始まった訪問の share_id（輪-5・7）。detailCount: この訪問で詳細の欄に出した商品の数（輪-6。商品 ID は持ち出さない）
export type Ids = { visitId: string; visitorId: string; fresh?: boolean; shareId?: string; detailCount?: number };

export const ID_RE = /^[A-Za-z0-9_-]{22}$/; // 16バイトの乱数を base64url（= なし）にした22文字

const SCENE_STEPS: readonly number[] = [2, 3]; // scene は段2・3だけ

function defaultRandom(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

// 16バイトの乱数 → base64url（= なし）の22文字。ほかの値から作らない（U-81）
export function randomId(random: (n: number) => Uint8Array = defaultRandom): string {
  let bin = "";
  for (const b of random(16)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function browserStorage(kind: "localStorage" | "sessionStorage"): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window[kind];
  } catch {
    return null; // 私的なウィンドウ・保存の禁止でアクセス自体が投げる
  }
}

type Visit = { visit_id: string; last_at: number; share_id?: string; opened: string[] };

function parseVisit(raw: string | null): Visit | null {
  if (raw === null) return null;
  try {
    const v = JSON.parse(raw) as { visit_id?: unknown; last_at?: unknown; share_id?: unknown; opened?: unknown };
    if (!(typeof v.visit_id === "string" && ID_RE.test(v.visit_id) && typeof v.last_at === "number" && Number.isFinite(v.last_at))) return null;
    const out: Visit = { visit_id: v.visit_id, last_at: v.last_at, opened: Array.isArray(v.opened) ? v.opened.filter((x): x is string => typeof x === "string") : [] };
    if (typeof v.share_id === "string" && ID_RE.test(v.share_id)) out.share_id = v.share_id;
    return out;
  } catch {
    return null;
  }
}

// 共有ページ /s/{share_id} の share_id。URL のパスだけから読み（クエリ・ハッシュは含めない）、22 文字の形に合うものだけ（輪-5）
export function shareIdOf(pathname: string): string | null {
  const m = /^\/s\/([A-Za-z0-9_-]{22})\/?$/.exec(pathname);
  return m ? m[1]! : null;
}

// 記録を送る直前に呼ぶ。訪問者 ID はずっと同じ。訪問の印は、前の記録から 30分以上（>=）あいていたら新しくする。
// 呼ぶたびに last_at を now にする。保存が使えない（読み書きで例外）ときは null（記録を送らない。D-47・S-116）。
// 新しい訪問を作ったとき、pathname（そのとき開いているページ）が共有ページなら share_id を持たせ、開いた詳細の一覧は空にする。
// 同じ訪問の間は share_id を変えない（輪-7）。openProduct を渡すと、詳細の欄に出した商品として一覧に入れる（重複は入れない。ブラウザの中だけ。輪-6）
export function touchVisit(storage: StorageLike | null, now: number, random: (n: number) => Uint8Array = defaultRandom, pathname = "", openProduct?: string): Ids | null {
  if (!storage) return null;
  try {
    let visitorId = storage.getItem(VISITOR_KEY);
    if (visitorId === null || !ID_RE.test(visitorId)) {
      visitorId = randomId(random);
      storage.setItem(VISITOR_KEY, visitorId);
    }
    const last = parseVisit(storage.getItem(VISIT_KEY));
    const fresh = !(last && now - last.last_at < VISIT_GAP_MS);
    const visitId = fresh ? randomId(random) : last!.visit_id;
    const shareId = fresh ? (shareIdOf(pathname) ?? undefined) : last!.share_id;
    const opened = fresh ? [] : last!.opened;
    if (openProduct !== undefined && !opened.includes(openProduct)) opened.push(openProduct);
    const visit: Record<string, unknown> = { visit_id: visitId, last_at: now };
    if (shareId) visit.share_id = shareId;
    if (opened.length) visit.opened = opened;
    storage.setItem(VISIT_KEY, JSON.stringify(visit));
    return { visitId, visitorId, fresh, ...(shareId ? { shareId } : {}), detailCount: opened.length };
  } catch {
    return null;
  }
}

// U-81: 本文に入るのは visit_id・visitor_id・step・scene・has_voice・entry・zero_cond・share_id・detail_count と、テストの訪問のときだけ test_key。
// share_id は段1〜4・6 では訪問の値（共有ページから始まった訪問だけ）、段5 は作ったリンクの値、段8 は押した共有ページの値（段7 には入れない。輪-1・2・4）。detail_count は段5だけ（輪-6。数だけ。商品 ID・一覧は入れない）。
// scene は段2・3、has_voice は段3、entry は段1、zero_cond は段7だけ。is_test を入れる経路は無い（付くのは test_key の一致だけ。サーバー側）。
// has_voice は 0／1（設計 D-40 の値の対応。声が 1 件以上あれば 1。DB は TINYINT(1)）で送る
export function buildEventBody(ids: Ids, step: EventStep, extra: EventExtra = {}, testKey: string | null = null): Record<string, unknown> {
  const body: Record<string, unknown> = { visit_id: ids.visitId, visitor_id: ids.visitorId, step };
  if (SCENE_STEPS.includes(step) && extra.scene) body.scene = extra.scene;
  if (step === 3 && typeof extra.has_voice === "boolean") body.has_voice = extra.has_voice ? 1 : 0;
  if (step === 1 && extra.entry) body.entry = extra.entry;
  if (step === 7 && extra.zero_cond) body.zero_cond = extra.zero_cond;
  const shareId = step === 5 || step === 8 ? extra.share_id : step === 7 ? undefined : ids.shareId;
  if (shareId && ID_RE.test(shareId)) body.share_id = shareId;
  if (step === 5) body.detail_count = ids.detailCount ?? 0;
  if (testKey) body.test_key = testKey.slice(0, TEST_KEY_MAX);
  return body;
}

// K-5: 最初に開いた URL の ?giftia_test=<合言葉> を sessionStorage に入れ、URL から取り除く（取り除いたクエリ文字列を返す。
// 目印が無ければ cleaned は null）。giftia_test=off で消す。sessionStorage が使えなければ印なしで送る。共有・コピー・OGP の URL には入れない
export function captureTestKey(search: string, session: StorageLike | null): { cleaned: string | null } {
  const q = new URLSearchParams(search);
  const v = q.get(TEST_QUERY);
  if (v === null) return { cleaned: null };
  try {
    if (v === "off") session?.removeItem(TEST_KEY_STORE);
    else if (v.length > 0 && v.length <= TEST_KEY_MAX) session?.setItem(TEST_KEY_STORE, v);
  } catch {
    // 保存できなければ印なしで送る
  }
  q.delete(TEST_QUERY);
  const rest = q.toString();
  return { cleaned: rest ? `?${rest}` : "" };
}

export function readTestKey(session: StorageLike | null): string | null {
  try {
    const v = session?.getItem(TEST_KEY_STORE) ?? null;
    return v && v.length <= TEST_KEY_MAX ? v : null;
  } catch {
    return null;
  }
}

type PostLike = (url: string, init: { method: "POST"; headers: Record<string, string>; body: string; keepalive: boolean }) => Promise<unknown>;

// 結果を待たず、失敗しても何も出さない・何も投げない（N-16）。keepalive で送る（sendBeacon は JSON だと事前確認が要るので使わない）。ログに本文は残さない
export function sendEvent(body: Record<string, unknown>, fetchImpl: PostLike = (url, init) => fetch(url, init)): void {
  try {
    void Promise.resolve(
      fetchImpl(apiUrl("/api/events"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true }),
    ).catch(() => undefined);
  } catch {
    // 画面には何も出さない
  }
}

// 画面の中の呼び出し点が使う型（テストでは差し替える）
export type Tracker = (step: EventStep, extra?: EventExtra) => void;

// ① 訪問の最初に開いたページの種類（D-40 の値の対応。R7）。cart・favorites は URL を持たないのでここでは返さない
export function entryOf(pathname: string, search: string): EventEntry {
  if (pathname === "/") return "top";
  if (pathname === "/search") return /^[A-Z][0-9]{1,9}$/.test(new URLSearchParams(search).get("product") ?? "") ? "detail" : "search";
  if (pathname.startsWith("/s/")) return "share";
  return "other";
}

// ⑦ 0 件になったときの条件（D-40）。価格帯だけ→price、カテゴリーだけ→category、両方→both、どちらも無くシーンだけ→scene_only。
// 条件が何も無い検索は全商品が出て 0 件にならないので、その組は null（記録しない）
export function zeroCondOf(c: { scene: boolean; priceBand: boolean; categories: boolean }): ZeroCond | null {
  if (c.priceBand && c.categories) return "both";
  if (c.priceBand) return "price";
  if (c.categories) return "category";
  return c.scene ? "scene_only" : null;
}

// ① サイトに来る: 最初に開いたとき 1 回。URL の giftia_test を取り込んで URL から取り除き（K-5）、入口の種類つきで段 1 を送る。
// 取り除いたあとの search を返す（画面は history.replaceState で URL を直す。目印が無ければ null）
export function trackFirstLoad(loc: { pathname: string; search: string }, deps: TrackDeps = {}): { cleaned: string | null } {
  const session = deps.session === undefined ? browserStorage("sessionStorage") : deps.session;
  const { cleaned } = captureTestKey(loc.search, session);
  track(1, { entry: entryOf(loc.pathname, cleaned ?? loc.search) }, { ...deps, session, loc: deps.loc ?? loc });
  return { cleaned };
}

export type TrackDeps = {
  local?: StorageLike | null;
  session?: StorageLike | null;
  now?: number;
  random?: (n: number) => Uint8Array;
  send?: (body: Record<string, unknown>) => void;
  loc?: { pathname: string; search: string }; // 新しい訪問の ① の入口に使う、そのとき開いているページ（既定は window.location）
};

type Ready = { ids: Ids; testKey: string | null; send: (body: Record<string, unknown>) => void };

// 訪問の印を決め、新しい訪問を作ったときは、その訪問の ① を先に送る（SP-34・D-47。PM 11/15 朝「段 1 を送る」）。保存が使えないときは null（送らない）
function begin(step: EventStep | null, deps: TrackDeps, openProduct?: string): Ready | null {
  const local = deps.local === undefined ? browserStorage("localStorage") : deps.local;
  const session = deps.session === undefined ? browserStorage("sessionStorage") : deps.session;
  const loc = deps.loc ?? (typeof window !== "undefined" ? window.location : null);
  const ids = touchVisit(local, deps.now ?? Date.now(), deps.random, loc?.pathname ?? "", openProduct);
  if (!ids) return null;
  const send = deps.send ?? sendEvent;
  const testKey = readTestKey(session);
  // entry は、そのとき開いているページの種類。段 1 の呼び出し自身のときは足さない（二重にしない）
  if (ids.fresh && step !== 1) send(buildEventBody(ids, 1, loc ? { entry: entryOf(loc.pathname, loc.search) } : {}, testKey));
  return { ids, testKey, send };
}

// 画面から呼ぶ入口: 訪問の印を決め、本文を作って送る。保存が使えないときは送らず false
export function track(step: EventStep, extra: EventExtra = {}, deps: TrackDeps = {}): boolean {
  const r = begin(step, deps);
  if (!r) return false;
  r.send(buildEventBody(r.ids, step, extra, r.testKey));
  return true;
}

// 詳細の欄に商品が出たとき（404・失敗は呼ばない）に呼ぶ。商品 ID を訪問の「開いた詳細」の一覧に入れる（ブラウザの中だけ。通信には出さない。
// ⑤ にはその数だけ入る。輪-6・N-13）。何も送らない（新しい訪問を作ったときの ① だけ送る）。保存が使えなければ何もしない（S-116）
export function noteDetailOpened(productId: string, deps: TrackDeps = {}): boolean {
  return begin(null, deps, productId) !== null;
}
