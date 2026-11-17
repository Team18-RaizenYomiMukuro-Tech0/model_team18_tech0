import test from "node:test";
import assert from "node:assert/strict";
import { bubbleLeft, SHARE_HELP_TEXT } from "./shareHelp.ts";

// F-47 SP-04 S-125 ④: 「？」のふきだし。文言と、画面の外にはみ出さない置き場所
test("shareHelp: 文言は SP-04 の案どおり", () => {
  assert.equal(SHARE_HELP_TEXT, "選んだ候補をリンクにして、LINE などで仲間に送れます。仲間は登録なしで見て、いいねで答えられます");
});
test("shareHelp: ふきだしは画面の左右 8px の内側に収まる", () => {
  assert.equal(bubbleLeft(40, 240, 375), 40); // 収まる
  assert.equal(bubbleLeft(300, 240, 375), 127); // 右にはみ出すので左へ寄せる（375-8-240）
  assert.equal(bubbleLeft(-20, 240, 375), 8); // 左にはみ出さない
  assert.equal(bubbleLeft(0, 400, 375), 8); // 画面より広くても左端 8px
});
