import { track, type Tracker } from "../lib/tracking.ts";
import { ORDER_DEMO_MESSAGE, type CartInfo } from "./cart.ts";

// D-31 SP-14 ② U-56: カートを開いたときの、商品ごとの確認（D-29）。失敗（404 以外）の商品だけ retry で読み直せる。
// 確かめた商品は読み直さない。応答は商品ごとに受け取り、dispose（パネルを閉じる）後の応答は捨てる。

// category（行の小さい画像）と arrives_on（行の届く日。D-34）は D-29 の応答から。404・失敗の行には無い
export type CartFound = CartInfo & { name?: string; category?: string; arrives_on?: string | null };
export type FetchInfo = (id: string, signal: AbortSignal) => Promise<CartFound>;

export class CartChecker {
  private found: Record<string, CartFound> = {};
  private readonly started = new Set<string>(); // 確認を始めた（応答待ちか済み）商品
  private readonly abort = new AbortController();

  private readonly fetchInfo: FetchInfo;
  private readonly onChange: (found: Readonly<Record<string, CartFound>>) => void;

  constructor(fetchInfo: FetchInfo, onChange: (found: Readonly<Record<string, CartFound>>) => void) {
    this.fetchInfo = fetchInfo;
    this.onChange = onChange;
  }

  // まだ確かめていない商品だけ確かめる
  check(ids: readonly string[]): void {
    for (const id of ids) this.load(id);
  }

  // 失敗した商品だけ、その商品だけ読み直す（ほかの商品は呼ばない）
  retry(id: string): void {
    if (this.found[id]?.status !== "error") return;
    const { [id]: _, ...rest } = this.found; // eslint-disable-line @typescript-eslint/no-unused-vars -- 分割代入で id の項目を除くため、_ は使わない
    this.found = rest; // 読み込み中の表示に戻す
    this.started.delete(id);
    this.onChange(this.found);
    this.load(id);
  }

  dispose(): void {
    this.abort.abort();
  }

  private load(id: string): void {
    if (this.started.has(id)) return;
    this.started.add(id);
    this.fetchInfo(id, this.abort.signal).then(
      (info) => this.done(id, info),
      () => this.done(id, { status: "error" }),
    );
  }

  private done(id: string, info: CartFound): void {
    if (this.abort.signal.aborted) return;
    this.found = { ...this.found, [id]: info };
    this.onChange(this.found);
  }
}

// SP-18 ③・F-26: 買える商品（販売終了・在庫なし・読めない商品・まだ確かめていない商品を除く）の種類の数
export function buyableCount(ids: readonly string[], found: Readonly<Record<string, CartFound | undefined>>): number {
  let n = 0;
  for (const id of ids) {
    const f = found[id];
    if (f?.status === "ok" && f.stock === "available") n++;
  }
  return n;
}

export const NO_BUYABLE_MESSAGE = "買える商品がありません";

// 「注文へ進む」の押せる条件（SP-18 ③）。買える商品が 0 件（空のカートも）なら押せず、すぐ上に「買える商品がありません」。
// 確認中（開いた直後で、まだ確かめ終わっていない商品がある）あいだは、文言を出さず「注文へ進む」だけ押せない（PM 11/15「確認中は何も出さない」）
export function orderGate(ids: readonly string[], found: Readonly<Record<string, CartFound | undefined>>): { canOrder: boolean; hint: string | null } {
  if (ids.some((id) => !found[id])) return { canOrder: false, hint: null };
  const canOrder = buyableCount(ids, found) > 0;
  return { canOrder, hint: canOrder ? null : NO_BUYABLE_MESSAGE };
}

// 「注文へ進む」を押したとき（SP-14・SP-34 ⑥ 注文へ進む）: 計測の段 6 を 1 件送り、デモの文言を返す（注文はしない）。
// 押せないとき（買える商品 0 件）は呼ばれない。計測の送り先は差し替えられる（テストは偽物）
export function pressOrder(ids: readonly string[], found: Readonly<Record<string, CartFound | undefined>>, tracker: Tracker = track): string | null {
  if (!orderGate(ids, found).canOrder) return null;
  tracker(6);
  return ORDER_DEMO_MESSAGE;
}

// SP-18 ③: 行の画像・詳細への道を置く行か。販売終了（404）と読めなかった行（商品の情報が無い）には置かない
export function rowHasProduct(info: CartFound | undefined): info is Extract<CartFound, { status: "ok" }> {
  return info?.status === "ok";
}

// 「買い物を続ける」の行き先（SP-18 ③）: すでに検索結果にいるときは移らない（閉じるだけで条件は変えない）。それ以外は /search
export function continueTarget(pathname: string | null): string | null {
  return pathname === "/search" ? null : "/search";
}
