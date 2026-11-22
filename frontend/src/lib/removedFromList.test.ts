import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { removedIds, visibleIds } from "./compare.ts";

// SP-23 ⑧・X-63・S-96 ⑧: 表が消えて一覧へ戻った後、外した商品は一覧からもすぐ消える（#664）
test("#664: ほかのタブで外れた商品の ID だけを返す（今も登録済みのものは返さない）", () => {
  assert.deepEqual(removedIds(["G1", "G2", "G3"], ["G1", "G3"]), ["G2"]);
  assert.deepEqual(removedIds(["G1", "G2"], ["G1", "G2"]), []);
});
test("#664: 一覧に出す商品から、外れた商品を除く（順番は変えない）", () => {
  assert.deepEqual(visibleIds(["G1", "G2", "G3"], ["G2"]), ["G1", "G3"]);
  assert.deepEqual(visibleIds(["G1", "G2"], []), ["G1", "G2"]);
});
test("#664: FavoritesPanel は storage の変更で外れた商品を一覧（リスト）から除く", () => {
  const src = readFileSync(new URL("../components/FavoritesPanel.tsx", import.meta.url), "utf8");
  assert.match(src, /removedIds\(/);
  assert.match(src, /visibleIds\(ids,\s*removed\)\.map\(/);
});
