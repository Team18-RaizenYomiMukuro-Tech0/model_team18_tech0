import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// S-123・S-131 暗幕-1・2（SP-08・SP-18・D-30・D-31。#581 案 A）: 詳細のシートの暗幕だけヘッダーより下。カート・お気に入りのパネルの暗幕は今のまま
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const z = (css: string, sel: string): number => {
  const m = css.match(new RegExp(`${sel.replace(/[.[\]]/g, "\\$&")}\\s*\\{[^}]*?z-index:\\s*(\\d+)`));
  assert.ok(m, `${sel} に z-index が無い`);
  return Number(m[1]);
};

test("暗幕-1: 詳細のシートの暗幕（.scrimLow）はヘッダー（20）より下。シート 40・パネル 50・ほかの暗幕 39 は変えない", () => {
  const g = read("app/globals.css");
  const r = read("components/results.module.css");
  const header = Number(g.match(/header\.top\s*\{[^}]*?z-index:\s*(\d+)/)?.[1]);
  assert.equal(header, 20);
  assert.ok(z(r, ".scrimLow") < header, "詳細の暗幕はヘッダーより下");
  assert.equal(z(r, ".scrim"), 39); // 共有リストのシート・パネルの暗幕は今のまま（ヘッダーも覆う）
  assert.equal(z(r, ".sheet"), 40);
  assert.equal(z(read("components/favorites.module.css"), ".overlay"), 50);
});

test("暗幕-1: 詳細のシート（DetailPanel）だけが暗幕をヘッダーの下にする。共有リストのシートは今のまま", () => {
  assert.match(read("components/DetailPanel.tsx"), /<Sheet [^>]*belowHeader/);
  for (const f of ["CandidateResults.tsx", "SearchResults.tsx", "TopListBand.tsx"]) assert.doesNotMatch(read(`components/${f}`), /<Sheet [^>]*belowHeader/, f);
  assert.match(read("components/Sheet.tsx"), /belowHeader \? styles\.scrimLow : styles\.scrim/);
});

test("S-131 ⑥ 暗幕-2: 900px 以上の詳細パネル（.side）の上端はヘッダーの下端（top: var(--hh)）。画面の上端（0）から始めてヘッダーを覆わない", () => {
  const r = read("components/results.module.css");
  const side = r.match(/\.side\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(side, /top:\s*var\(--hh\)/);
  assert.doesNotMatch(side, /top:\s*0[;\s]/);
});
