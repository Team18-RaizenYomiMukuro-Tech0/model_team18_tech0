import type { CartInfo } from "./cart.ts";

// D-31 SP-14 ② U-56: カートを開いたときの、商品ごとの確認（D-29）。失敗（404 以外）の商品だけ retry で読み直せる。
// 確かめた商品は読み直さない。応答は商品ごとに受け取り、dispose（パネルを閉じる）後の応答は捨てる。

export type CartFound = CartInfo & { name?: string };
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
    const { [id]: _, ...rest } = this.found; // eslint-disable-line @typescript-eslint/no-unused-vars
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
