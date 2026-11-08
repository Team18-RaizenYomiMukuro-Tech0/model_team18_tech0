import test from "node:test";
import assert from "node:assert/strict";
import { formatPrice } from "./formatPrice.ts";

// U-36 NF-29 #41-9
test("formatPrice U-36: 1500 → 1,500円（税込）", () => {
  assert.equal(formatPrice(1500), "1,500円（税込）");
});
test("formatPrice U-36: 999 → 999円（税込）（カンマなし）", () => {
  assert.equal(formatPrice(999), "999円（税込）");
});
test("formatPrice U-36: 50000 → 50,000円（税込）", () => {
  assert.equal(formatPrice(50000), "50,000円（税込）");
});
test("formatPrice U-36: 1000000 → 1,000,000円（税込）", () => {
  assert.equal(formatPrice(1000000), "1,000,000円（税込）");
});
