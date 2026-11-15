import test from "node:test";
import assert from "node:assert/strict";
import { TOP_DESCRIPTION, TOP_SUBLINES, TOP_TITLE } from "./pageMeta.ts";

test("S-80 ③: トップのタイトルと説明（見出し＋下の行をつないだ文）", () => {
  assert.equal(TOP_TITLE, "Giftia");
  assert.equal(TOP_DESCRIPTION, "ありがとうに、ちょうどいいギフト。相手とシーンに合わせて、気持ちが伝わる贈りものを。");
});

test("S-114: 下の行は「、」の後で 2 行（どの幅でも）", () => {
  assert.deepEqual([...TOP_SUBLINES], ["相手とシーンに合わせて、", "気持ちが伝わる贈りものを。"]);
});
