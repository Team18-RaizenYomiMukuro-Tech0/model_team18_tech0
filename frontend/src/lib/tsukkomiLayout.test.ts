import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { harisenTip, insideCard, tsukkomiLayout, TSUKKOMI_LAYOUT } from "./tsukkomiLayout.ts";

// S-139 ④・S-140 ⑧（D-09「札と位置」。PM 11/20「全体を真ん中にする」「枠に入れば合格」）。画面は 375×640・768×1024・1280×800 を例にする
const SIZES: [number, number][] = [[375, 640], [768, 1024], [1280, 800]];

test("U-105 札の位置は画面の中心（cx＝幅÷2・cy＝高さ×0.46）から決まる。見本 版 3 の値", () => {
  const l = tsukkomiLayout(375, 640);
  assert.equal(l.cx, 187.5);
  assert.equal(l.cy, 640 * 0.46);
  assert.deepEqual(l.card, { left: 187.5 - 150, top: 640 * 0.46 - 32, w: 110, h: 64 });
  assert.equal(l.faceLeft, 187.5 + 8);
  assert.equal(l.faceTop, 640 * 0.46 - 78);
  assert.deepEqual(l.hand, { x: l.faceLeft + 10, y: l.faceTop + 72 });
  assert.equal(l.bubbleTop, 640 * 0.46 + 70);
});

test("U-105 どの幅でも同じ形: 中心からの差（札・顔・手・札の中心・吹き出し）が幅によらず一定", () => {
  const rel = (w: number, h: number) => {
    const l = tsukkomiLayout(w, h);
    return [l.card.left - l.cx, l.card.top - l.cy, l.faceLeft - l.cx, l.faceTop - l.cy, l.hand.x - l.cx, l.hand.y - l.cy, l.target.x - l.cx, l.target.y - l.cy, l.bubbleTop - l.cy, l.rot].map((n) => Math.round(n * 1e6) / 1e6);
  };
  const base = rel(375, 640);
  for (const [w, h] of SIZES) assert.deepEqual(rel(w, h), base, `${w}px`);
});

test("U-105 ハリセンが当たる時点で、先が札の枠に入る（375px・768px・1280px）。本物の数の位置は入力に無い", () => {
  for (const [w, h] of SIZES) {
    const l = tsukkomiLayout(w, h);
    assert.equal(insideCard(l, harisenTip(l)), true, `${w}px 当たりの先`);
    assert.equal(insideCard(l, l.target), true);
    assert.equal(tsukkomiLayout.length, 2); // 引数は画面の幅と高さだけ（ページの数の位置・anchor は受け取らない）
  }
});

test("U-105 スパーン！は札の位置から出て、画面の幅の中に収まる。吹き出しは左右の真ん中（cx）", () => {
  for (const [w, h] of SIZES) {
    const l = tsukkomiLayout(w, h);
    assert.ok(l.impactLeft >= 0 && l.impactLeft + TSUKKOMI_LAYOUT.impactW <= w, `${w}px`);
    assert.equal(l.impactTop, l.target.y - 100);
    assert.equal(l.cx, w / 2);
  }
});

test("U-105 Tsukkomi は札に押した後の数 count を出し、札をつぶす。ページの数（anchor・data-likecount）を探さず、つぶさない", () => {
  const src = readFileSync(new URL("../components/Tsukkomi.tsx", import.meta.url), "utf8");
  assert.match(src, /\{count\}/); // 札の数＝押した後の数
  assert.match(src, /card\?\.animate\(\[\{ transform: "scale\(1\)" \}, \{ transform: "scale\(1\.7,\.45\)" \}/); // つぶれるのは札
  assert.doesNotMatch(src, /anchor|data-likecount|data-likerow|closest\(/);
  const view = readFileSync(new URL("../components/SharedView.tsx", import.meta.url), "utf8");
  assert.match(view, /count: c\.snapshot\[id\]\?\.count/); // 押した後の画面の数
  assert.doesNotMatch(view, /anchor: button/);
});
