import test from "node:test";
import assert from "node:assert/strict";
import { closeOnLeave } from "./effectClose.ts";

// S-134 ③・S-140 ⑨（D-09 7個目-16・ツッコミ-19）: 回転・タブを離れるで閉じる。外したあとに listener が残らない
function fakes() {
  const mqL = new Set<() => void>();
  const docL = new Set<() => void>();
  const mq = { addEventListener: (_t: "change", l: () => void) => void mqL.add(l), removeEventListener: (_t: "change", l: () => void) => void mqL.delete(l) };
  const doc = { visibilityState: "visible", addEventListener: (_t: "visibilitychange", l: () => void) => void docL.add(l), removeEventListener: (_t: "visibilitychange", l: () => void) => void docL.delete(l) };
  return { mqL, docL, mq, doc };
}

test("U-101/U-105 回転（orientation の change）で閉じる", () => {
  const { mqL, mq, doc } = fakes();
  let closed = 0;
  closeOnLeave(() => closed++, mq, doc);
  mqL.forEach((l) => l());
  assert.equal(closed, 1);
});

test("U-101/U-105 タブを離れる（hidden）で閉じる。visible に戻っても閉じない", () => {
  const { docL, mq, doc } = fakes();
  let closed = 0;
  closeOnLeave(() => closed++, mq, doc);
  doc.visibilityState = "visible";
  docL.forEach((l) => l());
  assert.equal(closed, 0);
  doc.visibilityState = "hidden";
  docL.forEach((l) => l());
  assert.equal(closed, 1);
});

test("U-101/U-105 後片付けで listener が 0 個になる（外したあとは閉じない）。mq が無くても動く", () => {
  const { mqL, docL, mq, doc } = fakes();
  const stop = closeOnLeave(() => assert.fail("閉じてはいけない"), mq, doc);
  assert.equal(mqL.size + docL.size, 2);
  stop();
  assert.equal(mqL.size + docL.size, 0);
  const d2 = fakes();
  const stop2 = closeOnLeave(() => {}, null, d2.doc);
  assert.equal(d2.docL.size, 1);
  stop2();
  assert.equal(d2.docL.size, 0);
});

test("SevenReach・Tsukkomi の両方が closeOnLeave を呼び、後片付けで外す", async () => {
  const { readFileSync } = await import("node:fs");
  for (const f of ["SevenReach.tsx", "Tsukkomi.tsx"]) {
    const src = readFileSync(new URL(`../components/${f}`, import.meta.url), "utf8");
    assert.match(src, /closeOnLeave\(\(\) => close\.current\(\), window\.matchMedia\("\(orientation: portrait\)"\), document\)/, f);
    assert.match(src, /stopLeave\(\);/, f);
  }
});
