import assert from "node:assert/strict";
import { test } from "node:test";
import { DETAIL_HINT, LIST_EMPTY_HINT, RIGHT_TABS, nextTab, pickedAnnouncement, tabLabel } from "./rightColumn.ts";

test("rightColumn S-93: タブは「詳細」が左、「共有リスト（N件）」が右。件数は共有リストの名前に含める", () => {
  assert.deepEqual([...RIGHT_TABS], ["detail", "list"]);
  assert.equal(tabLabel("detail", 3), "詳細");
  assert.equal(tabLabel("list", 0), "共有リスト（0件）");
  assert.equal(tabLabel("list", 3), "共有リスト（3件）");
});
test("rightColumn S-117: ← → で隣へ（端は回る）・Home で先頭・End で末尾。ほかのキーは何もしない", () => {
  assert.equal(nextTab("detail", "ArrowRight"), "list");
  assert.equal(nextTab("list", "ArrowRight"), "detail");
  assert.equal(nextTab("detail", "ArrowLeft"), "list");
  assert.equal(nextTab("list", "ArrowLeft"), "detail");
  assert.equal(nextTab("list", "Home"), "detail");
  assert.equal(nextTab("detail", "End"), "list");
  assert.equal(nextTab("detail", "Tab"), null);
  assert.equal(nextTab("detail", "Enter"), null);
});
test("rightColumn S-117: 件数の読み上げ（入れた・外した・変わらない）", () => {
  assert.equal(pickedAnnouncement(2, 3), "共有リストに入れました（3件）");
  assert.equal(pickedAnnouncement(3, 2), "外しました（2件）");
  assert.equal(pickedAnnouncement(2, 2), "");
});
test("rightColumn S-117: 案内の文は文書のとおり", () => {
  assert.equal(DETAIL_HINT, "カードを押すと、ここに詳細が出ます");
  assert.equal(LIST_EMPTY_HINT, "候補の『共有リストに入れる』を押すと、ここに並びます");
});
