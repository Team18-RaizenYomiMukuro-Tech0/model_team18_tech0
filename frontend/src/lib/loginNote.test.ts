import { test } from "node:test";
import assert from "node:assert/strict";
import { LOGIN_NOTE_MESSAGE, LOGIN_NOTE_MS } from "./loginNote.ts";

// U-99（D-25 SP-08 #484）: ヘッダーのログイン（準備中）を押したときの知らせの文言と時間
test("U-99 知らせの文言は一字一句「ログインは準備中です」", () => {
  assert.equal(LOGIN_NOTE_MESSAGE, "ログインは準備中です");
});
test("U-99 知らせを出しておく時間は 2 秒（2000 ミリ秒）", () => {
  assert.equal(LOGIN_NOTE_MS, 2000);
});
