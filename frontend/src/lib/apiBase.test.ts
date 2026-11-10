import test from "node:test";
import assert from "node:assert/strict";
import { apiUrl, candidatesUrl } from "./api.ts";

// D-16 D-33: NEXT_PUBLIC_API_BASE が未設定なら相対パス、設定ありなら先頭に付く
test("apiBase: 未設定・空なら相対パスのまま", () => {
  assert.equal(apiUrl("/api/candidates?scene=a", undefined), "/api/candidates?scene=a");
  assert.equal(apiUrl("/api/candidates?scene=a", ""), "/api/candidates?scene=a");
});

test("apiBase: 設定ありなら先頭に付く（末尾の / は重ならない）", () => {
  assert.equal(apiUrl("/api/x", "https://api.example.com"), "https://api.example.com/api/x");
  assert.equal(apiUrl("/api/x", "https://api.example.com/"), "https://api.example.com/api/x");
});

test("apiBase: candidatesUrl は環境変数を使う（未設定で相対、設定ありで先頭が付く）", () => {
  const prev = process.env.NEXT_PUBLIC_API_BASE;
  try {
    delete process.env.NEXT_PUBLIC_API_BASE;
    assert.equal(candidatesUrl({ scene: "送別", priceBand: null }), "/api/candidates?scene=%E9%80%81%E5%88%A5");
    process.env.NEXT_PUBLIC_API_BASE = "https://api.example.com";
    assert.equal(candidatesUrl({ scene: "送別", priceBand: "3000to4999" }), "https://api.example.com/api/candidates?scene=%E9%80%81%E5%88%A5&price_band=3000to4999");
  } finally {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_API_BASE;
    else process.env.NEXT_PUBLIC_API_BASE = prev;
  }
});
