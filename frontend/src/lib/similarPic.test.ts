import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SP-25 #663（PM 決定 2026-11-22）: 似た商品の画像は 64px（枠も画像も）。押せる高さ 44px 以上（N-12）は崩さない
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("SP-25 似た商品の画像は 64px（.pic の幅・.pic img の幅と高さ）。TSX の width/height も 64。.item の min-height 44px は残す", () => {
  const css = read("components/similar.module.css");
  assert.match(css, /\.pic\s*\{[^}]*width:\s*64px/);
  const img = css.match(/\.pic img\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(img, /width:\s*64px/);
  assert.match(img, /height:\s*64px/);
  assert.doesNotMatch(css, /48px/);
  assert.match(css, /\.item\s*\{[^}]*min-height:\s*44px/);
  assert.match(read("components/SimilarProducts.tsx"), /width=\{64\} height=\{64\}/);
});
