import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// S-146（SP-31。#592。PM 決定 2026-11-21 A-5・2026-11-22）: 価格帯の 3 つは 375px・393px で 1 行。文字を小さくし、間も詰める。押せる大きさは 44px 以上（N-12）
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("S-146 価格帯の 3 つ: 480px 以下で折り返さず（nowrap）、文字は 16px より小さく、間は 8px より小さい。高さ 44px 以上は崩さない", () => {
  const css = read("components/conditions.module.css");
  const media = css.match(/@media \(max-width: 480px\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.ok(media.length > 0, "480px 以下の @media が無い");
  const grp = media.match(/\.pricegroup\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(grp, /flex-wrap:\s*nowrap/);
  const gap = Number(grp.match(/gap:\s*(\d+)px/)?.[1]);
  assert.ok(gap < 8, `間（${gap}px）は 8px より小さい`);
  const btn = media.match(/\.pricegroup \.btn\s*\{([^}]*)\}/)?.[1] ?? "";
  const fs = Number(btn.match(/font-size:\s*(\d+)px/)?.[1]);
  assert.ok(fs < 16 && fs >= 12, `文字（${fs}px）は 12〜15px`);
  assert.match(btn, /white-space:\s*nowrap/);
  assert.doesNotMatch(btn, /min-height:\s*(?!44px)/); // 44px 以上のまま（.btn の min-height 44px を弱めない）
  assert.match(css, /\.btn, \.clear \{ min-width: 44px; min-height: 44px;/);
});

test("S-146 価格帯のボタンの並び（SearchConditions）が .pricegroup を使う。シーンの並びなど、ほかの並びは変えない", () => {
  const src = read("components/SearchConditions.tsx");
  assert.match(src, /className=\{`\$\{styles\.group\} \$\{styles\.pricegroup\}`\}[^>]*aria-labelledby="cond-price"/);
  assert.match(src, /className=\{styles\.group\} role="group" aria-labelledby="cond-scene"/);
});
