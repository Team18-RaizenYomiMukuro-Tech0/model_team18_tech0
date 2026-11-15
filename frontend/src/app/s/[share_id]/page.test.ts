import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";

// SP-19 D-36 N-15（S-80 ②）: 共有ページの固定 metadata。page.tsx は画面部品を読むので、ソースの文字で確かめる。
const src = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

test("S-80 ②: 説明・タイトル・画像が仕様どおり", () => {
  assert.match(src, /const TITLE = "Giftia の贈りもの候補"/);
  assert.match(src, /const DESCRIPTION = "どれがいいと思う？いいねで教えて。"/);
  assert.match(src, /openGraph: \{ title: TITLE, description: DESCRIPTION/);
  assert.match(src, /images: \[IMAGE\]/); // og:image
  assert.match(src, /twitter: \{ card: "summary_large_image"[^}]*images: \[IMAGE\.url\]/); // twitter:image
  assert.match(src, /url: "\/ogp-share\.png"/);
  assert.match(src, /robots: \{ index: false, follow: false \}/); // N-07 noindex は今どおり
});
test("N-15: metadata は固定（DB・共有リンクの中身を読まず、商品名・理由・価格の語が無い）", () => {
  const meta = src.slice(src.indexOf("export const metadata"), src.indexOf("export default"));
  assert.doesNotMatch(meta, /generateMetadata|fetch|params|product|reason|price|価格|理由/);
});
test("S-112: ogp-share.png は 1200×630 の PNG", () => {
  const f = new URL("../../../../public/ogp-share.png", import.meta.url);
  assert.ok(statSync(f).size > 0);
  const b = readFileSync(f);
  assert.equal(b.readUInt32BE(16), 1200);
  assert.equal(b.readUInt32BE(20), 630);
});
