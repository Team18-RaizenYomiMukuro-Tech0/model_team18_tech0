import { test as base, expect, type Page, type Route } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// 通しの確認 VE の API の差し替え（テスト設計.md「画面の通し確認」共通の前提・未決 4・5）。
// 画面が呼ぶ /api/* はすべてここで差し替える。一覧に無い呼び出しは「想定外」として記録し、テストの終わりに失敗にする（本番へ漏らさない）。
// 差し替えの JSON は e2e/fixtures/（FD-1・FD-9 から手で作った架空のデータ）。

const here = dirname(fileURLToPath(import.meta.url));
export const fixture = <T>(name: string): T => JSON.parse(readFileSync(join(here, "fixtures", name), "utf8")) as T;

type Product = { product_id: string; name: string; price: number; category: string };
type Detail = Product & { status: string };

export type Call = { method: string; pathname: string; search: URLSearchParams };

export type Overrides = {
  /** GET /api/candidates の応答を決める。null を返すと想定外の呼び出しにする */
  candidates?: (q: URLSearchParams) => { body: unknown; delayMs?: number } | null;
  /** POST /api/share-links */
  shareLinkDelayMs?: number;
  /** GET /api/share-links/{id} */
  shared?: (id: string) => { status: number; body: unknown; delayMs?: number } | null;
};

export class Api {
  readonly calls: Call[] = [];
  readonly unexpected: string[] = [];
  constructor(private readonly o: Overrides) {}

  count(method: string, pathname: string): number {
    return this.calls.filter((c) => c.method === method && c.pathname === pathname).length;
  }
  last(method: string, pathname: string): Call | undefined {
    return this.calls.filter((c) => c.method === method && c.pathname === pathname).at(-1);
  }

  async install(page: Page): Promise<void> {
    await page.route(/\/api\//, (route) => this.handle(route));
  }

  private json(route: Route, body: unknown, status = 200, delayMs = 0): Promise<void> {
    return (async () => {
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    })();
  }

  private async handle(route: Route): Promise<void> {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const path = url.pathname;
    this.calls.push({ method, pathname: path, search: url.searchParams });
    const fail = () => {
      this.unexpected.push(`${method} ${path}${url.search}`);
      return route.fulfill({ status: 599, contentType: "text/plain", body: "想定外の /api 呼び出し" });
    };

    // 計測: 204（本文なし）。本番の /api/events へは出さない
    if (method === "POST" && path === "/api/events") return route.fulfill({ status: 204 });

    if (method === "GET" && path === "/api/candidates") {
      const r = this.o.candidates?.(url.searchParams);
      return r ? this.json(route, r.body, 200, r.delayMs) : fail();
    }
    if (method === "POST" && path === "/api/share-links") {
      return this.json(route, fixture("share-link-created.json"), 201, this.o.shareLinkDelayMs ?? 0);
    }
    // 共有ページのいいね（設計 D-38・D-39）。VE では押さないが、押されても本番へ出ないよう差し替える
    const like = /^\/api\/share-links\/([^/]+)\/likes$/.exec(path);
    if (method === "POST" && like) {
      const b = JSON.parse(req.postData() ?? "{}") as { product_id?: string; on?: boolean };
      return this.json(route, { product_id: b.product_id, like_count: b.on ? 1 : 0, capped: false });
    }
    const shared = /^\/api\/share-links\/([^/]+)$/.exec(path);
    if (method === "GET" && shared) {
      const r = this.o.shared?.(decodeURIComponent(shared[1]));
      return r ? this.json(route, r.body, r.status, r.delayMs) : fail();
    }
    if (method === "GET" && path === "/api/products") return this.products(route, url);
    const detail = /^\/api\/products\/([^/]+)$/.exec(path);
    if (method === "GET" && detail) {
      const d = fixture<Record<string, Detail>>("fd1-product-details.json")[decodeURIComponent(detail[1])];
      return d ? this.json(route, d) : this.json(route, { detail: "not_found" }, 404);
    }
    if (method === "GET" && /^\/api\/products\/[^/]+\/voices$/.test(path)) return this.json(route, { voices: [] });
    if (method === "GET" && /^\/api\/products\/[^/]+\/similar$/.test(path)) return this.json(route, { items: [] });
    return fail();
  }

  // GET /api/products: 条件なし＝トップのおすすめ（FD-1 の先頭 4 件）、price_band あり＝FD-9 の 3000to4999 の 31 件（12 件ずつ）
  private products(route: Route, url: URL): Promise<void> {
    const q = url.searchParams;
    if ([...q.keys()].some((k) => k !== "price_band" && k !== "page")) return route.fulfill({ status: 599, body: "" }).then(() => void this.unexpected.push(`GET ${url.pathname}${url.search}`));
    if (!q.has("price_band")) {
      const items = fixture<Product[]>("fd1-products.json").slice(0, 4);
      return this.json(route, { items, count: items.length, total: items.length, page: 1, page_size: 12 });
    }
    if (q.get("price_band") !== "3000to4999") return route.fulfill({ status: 599, body: "" }).then(() => void this.unexpected.push(`GET ${url.pathname}${url.search}`));
    const all = fixture<Product[]>("fd9-products-3000to4999.json");
    const page = Number(q.get("page") ?? "1");
    const items = all.slice((page - 1) * 12, page * 12);
    return this.json(route, { items, count: items.length, total: all.length, page, page_size: 12 });
  }
}

// 各テストの前に、差し替えを入れる。終わりに、想定外の /api 呼び出しが 0 件かを確かめる
export const test = base.extend<{ api: Api; apiOverrides: Overrides }>({
  apiOverrides: [{}, { option: true }],
  api: [async ({ page, apiOverrides }, use) => {
    const api = new Api(apiOverrides);
    await api.install(page);
    await use(api);
    expect(api.unexpected, "一覧に無い /api/* の呼び出し").toEqual([]);
  }, { auto: true }], // どのテストでも必ず差し替えを入れる（入れ忘れて本物の /api へ出さない）
});
export { expect };
