import type { Page } from "@playwright/test";
import { test, expect, fixture } from "./api";

// VE-03 S-14・S-15・S-16・S-18（SP-06）: 共有ページ /s/{id} を 375px で開く。テスト設計.md「画面の通し確認」VE-03。
// ①商品 1 件 ②商品 10 件（理由が長い商品を含む）③期限切れ（410）④見つからない（404）。
// 文字の欠け（長い理由文）は見え方なので S-18 の人の確認に残し、ここでは横スクロールの有無だけを見る。

test.use({
  viewport: { width: 375, height: 800 },
  apiOverrides: {
    shared: (id) => {
      if (id === "one") return { status: 200, body: fixture("shared-1.json"), delayMs: 800 }; // 読み込み中を見るため遅らせる
      if (id === "ten") return { status: 200, body: fixture("shared-10.json") };
      if (id === "expired") return { status: 410, body: { detail: "expired" } };
      if (id === "missing") return { status: 404, body: { detail: "not_found" } };
      return null;
    },
  },
});

const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test("VE-03 S-14 S-18 商品 1 件の共有ページは、読み込み中のあと、作成時点の商品名・価格・理由が出る", async ({ page }, testInfo) => {
  await page.goto("/s/one");
  await expect(page.getByText("読み込み中")).toBeVisible();
  await expect(page.getByText("P09の贈りもの")).toBeVisible();
  await expect(page.getByText("読み込み中")).toHaveCount(0);
  await expect(page.getByText("3,800円")).toBeVisible();
  await expect(page.getByText("評価は4.6（120件）。送別の贈りものとして選ばれています。")).toBeVisible();
  expect(await noHorizontalScroll(page)).toBe(true);
  await testInfo.attach("ve03-one-375", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
});

test("VE-03 S-15 S-18 商品 10 件の共有ページも、同じ形で出て、横スクロールが無い", async ({ page }, testInfo) => {
  await page.goto("/s/ten");
  const items = fixture<{ items: { name: string; reason: string }[] }>("shared-10.json").items;
  for (const it of items) await expect(page.getByText(it.name, { exact: true })).toBeVisible();
  await expect(page.getByText(items[4].reason.slice(0, 40)).first()).toBeVisible(); // 理由が長い商品
  expect(await noHorizontalScroll(page)).toBe(true);
  await testInfo.attach("ve03-ten-375", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
});

test("VE-03 S-16 期限切れ（410）は「このリンクは期限切れです」と案内が出て、商品は出ない", async ({ page }) => {
  await page.goto("/s/expired");
  await expect(page.getByText("このリンクは期限切れです")).toBeVisible();
  await expect(page.getByText("作った人に、新しいリンクを頼んでください")).toBeVisible();
  await expect(page.getByText(/^P\d+の贈りもの$/)).toHaveCount(0);
});

test("VE-03 S-16 見つからない（404）は「リンクが見つかりません」と出て、商品は出ない", async ({ page }) => {
  await page.goto("/s/missing");
  await expect(page.getByText("リンクが見つかりません")).toBeVisible();
  await expect(page.getByText(/^P\d+の贈りもの$/)).toHaveCount(0);
});
