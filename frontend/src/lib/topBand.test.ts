import test from "node:test";
import assert from "node:assert/strict";
import { topBandText } from "./topBand.ts";
import { detailFromShareHref, detailHref } from "./sharedLink.ts";

// F-47 SP-04 S-125 ④⑤: トップの帯の文言（カートは並べない）／共有ページから開いた詳細の目印
test("topBand: 「共有リスト n件」だけ", () => {
  assert.equal(topBandText(1), "共有リスト 1件");
  assert.equal(topBandText(10), "共有リスト 10件");
});
test("sharedLink F-47: 共有ページのリンクにだけ from=share が付く", () => {
  assert.equal(detailHref("G0002"), "/search?product=G0002");
  assert.equal(detailFromShareHref("G0002"), "/search?product=G0002&from=share");
});
