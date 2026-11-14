import { fetchJson, isProductList, type Fetched, type ProductList } from "./products.ts";
import type { Scene } from "./api.ts";
import type { PriceBand } from "./priceBand.ts";
import type { SearchQuery } from "./searchQuery.ts";

// R8 D-27 #46-1 #50-2 #55-3 F-12 F-18 I-34 I-35 E-15: 検索結果の条件の操作（純粋な部分）と、R-02 の取得の実行役。
// 条件ボタンは押した時点で結果を出し直し、同じボタンの再押下で解除する。どの操作もページは1に戻す。

export const AUTO_SEARCH_NOTE = "条件を選ぶと自動で検索されます";
// 条件の見出し（SP-10・D-27、PM 判断 2026-11-14 #255）。1行目: シーン・価格帯（同じ行）、2行目: カテゴリー（複数選べます）
export const CONDITION_HEADINGS = { scene: "シーン", price: "価格帯（税込）", category: "カテゴリー", categoryHint: "（複数選べます）" } as const;

export const toggleScene = (q: SearchQuery, s: Scene): SearchQuery => ({ ...q, scene: q.scene === s ? null : s, page: 1 });
export const togglePrice = (q: SearchQuery, b: PriceBand): SearchQuery => ({ ...q, priceBand: q.priceBand === b ? null : b, page: 1 });
// 複数選べる。押したものだけ選ぶ・外すを切り替え、ほかは外さない（#58-5）
export const toggleCategory = (q: SearchQuery, name: string): SearchQuery => ({
  ...q,
  categories: q.categories.includes(name) ? q.categories.filter((c) => c !== name) : [...q.categories, name],
  page: 1,
});
// シーン・価格帯・カテゴリーをすべて外す。選んだ候補は画面全体の状態（D-32）にあるので触らない（#50-2、#55-3）
export const clearConditions = (q: SearchQuery): SearchQuery => ({ ...q, scene: null, priceBand: null, categories: [], page: 1 });
export const hasConditions = (q: SearchQuery): boolean => q.scene !== null || q.priceBand !== null || q.categories.length > 0;

// R-02（GET /api/products）の実行役。run のたびに「最新の1回」だけが画面に反映される。
// 古い要求は中止し、遅れて届いた古い応答は捨てる。10秒で打ち切って失敗にする（fetchJson。再試行は同じ URL でもう一度 run）。
export class ProductRunner {
  private token = 0;
  private abort: AbortController | null = null;
  private readonly onChange: (url: string, r: Fetched<ProductList> | null) => void;
  private readonly fetchImpl: typeof fetch;

  constructor(onChange: (url: string, r: Fetched<ProductList> | null) => void, fetchImpl: typeof fetch = (...a) => fetch(...a)) {
    this.onChange = onChange;
    this.fetchImpl = fetchImpl;
  }

  run(url: string): void {
    this.cancel();
    const mine = ++this.token;
    const abort = new AbortController();
    this.abort = abort;
    this.onChange(url, null);
    void fetchJson(url, isProductList, abort.signal, this.fetchImpl).then((r) => {
      if (mine === this.token) this.onChange(url, r);
    });
  }

  cancel(): void {
    this.token++;
    this.abort?.abort();
    this.abort = null;
  }
}
