import test from "node:test";
import assert from "node:assert/strict";
import nextConfig from "../../next.config.ts";

// U-119 D-53: 画面の守りのヘッダー。next.config.ts の headers() と poweredByHeader を見る（サーバーは起動しない）
const EXPECTED: Record<string, string> = {
  "X-Robots-Tag": "noindex, nofollow",
  "Strict-Transport-Security": "max-age=31536000",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

async function rules() {
  assert.ok(nextConfig.headers, "headers() がある");
  return await nextConfig.headers();
}

test("securityHeaders: source /:path* の規則が 1 本だけ", async () => {
  const r = await rules();
  assert.equal(r.length, 1);
  assert.equal(r[0].source, "/:path*");
});

test("securityHeaders: 6 つのヘッダーが 1 つずつ・値が設計 D-53 と完全一致・重複なし", async () => {
  const h = (await rules())[0].headers;
  const keys = h.map((x) => x.key);
  assert.equal(new Set(keys).size, keys.length, "キーが重複しない");
  assert.deepEqual([...keys].sort(), Object.keys(EXPECTED).sort());
  for (const { key, value } of h) assert.equal(value, EXPECTED[key], key);
});

test("securityHeaders: HSTS に includeSubDomains・preload を含まない", async () => {
  const h = (await rules())[0].headers;
  const v = h.find((x) => x.key === "Strict-Transport-Security")!.value;
  assert.ok(!/includeSubDomains/i.test(v));
  assert.ok(!/preload/i.test(v));
});

test("securityHeaders: CSP は frame-ancestors 'none' だけ", async () => {
  const h = (await rules())[0].headers;
  const v = h.find((x) => x.key === "Content-Security-Policy")!.value;
  assert.equal(v, "frame-ancestors 'none'");
  assert.ok(!v.includes(";"));
});

test("securityHeaders: poweredByHeader が false", () => {
  assert.equal(nextConfig.poweredByHeader, false);
});
