// 偽の fetch（テスト設計「共通の前提」）。登録した /api/* の応答だけを返し、無いものは「想定外の呼び出し」として記録して、
// テストの終わりに失敗にする（本番へ漏らさない）。計測（/api/events）は何も返さない 204 で受ける。
import { vi } from "vitest";

export type Reply = { status?: number; body?: unknown; delayMs?: number; throws?: boolean };
type Route = Reply | (() => Reply);

const routes = new Map<string, Route>();
export const unexpected: string[] = [];
export const calls: string[] = [];

/** path（クエリは含めない）に偽の応答を登録する。関数なら呼ぶたびに中身を決められる */
export function fakeApi(path: string, reply: Route): void {
  routes.set(path, reply);
}

export function resetFakeApi(): void {
  routes.clear();
  unexpected.length = 0;
  calls.length = 0;
}

export function installFakeFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const path = url.split("?")[0];
      calls.push(url);
      if (path === "/api/events") return new Response(null, { status: 204 });
      const route = routes.get(path);
      if (!route) {
        unexpected.push(`${init?.method ?? "GET"} ${url}`);
        return new Response("fake: no route", { status: 599 });
      }
      const r = typeof route === "function" ? route() : route;
      if (r.delayMs) await new Promise((res) => setTimeout(res, r.delayMs));
      if (r.throws) throw new TypeError("fake: network down");
      const status = r.status ?? 200;
      return new Response(status === 204 ? null : JSON.stringify(r.body ?? {}), { status, headers: { "Content-Type": "application/json" } });
    }),
  );
}
