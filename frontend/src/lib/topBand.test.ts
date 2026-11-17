import test from "node:test";
import assert from "node:assert/strict";
import { topBandText } from "./topBand.ts";

// F-47 SP-04 S-125 ④: トップの帯の文言（カートは並べない）
test("topBand: 「共有リスト n件」だけ", () => {
  assert.equal(topBandText(1), "共有リスト 1件");
  assert.equal(topBandText(10), "共有リスト 10件");
});
