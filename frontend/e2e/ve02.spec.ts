import { test, expect, fixture } from "./api";

// VE-02 S-08・S-10・S-11・S-12（SP-04・SP-05）: 候補を選んで共有リストを作る。テスト設計.md「画面の通し確認」VE-02。1280px。
// ボタンの名前は S-79 の「共有リストを作る」。

test.use({
  apiOverrides: {
    candidates: (q) => (q.has("price_band") ? { body: fixture("candidates-songbetsu-3000to4999.json") } : { body: fixture("candidates-songbetsu.json") }),
    shareLinkDelayMs: 800, // 200 ミリ秒以上遅らせる
  },
});

test("VE-02 S-08 S-10 S-11 S-12 候補を選ぶと共有リストを作れ、作成中は二度押せず、成功で画面が変わらない", async ({ page, api }, testInfo) => {
  // VE-01 の結果が出た状態（FD-1 の 8 件）
  await page.goto("/");
  await page.getByRole("group", { name: "シーン" }).getByRole("button", { name: "送別" }).click();
  await expect(page.getByRole("heading", { name: "候補（11件）" })).toBeVisible();
  await page.getByRole("button", { name: "3,000〜4,999円" }).click();
  await expect(page.getByRole("heading", { name: "候補（8件）" })).toBeVisible();

  const listTab = (n: number) => page.getByRole("tab", { name: `共有リスト（${n}件）` });
  const pickBtns = page.getByRole("button", { name: /共有リストに入れる|✓ リストに入れた/ });
  const createBtn = page.getByRole("button", { name: /共有リストを作る|作成中/ });
  const selected = page.locator("section[aria-labelledby=h-selected]");

  // ① 0 件: 「選んだ候補」の欄も作成ボタンも出ない。何も作られない。右の列のタブは出る（押すと入れ方の案内だけ）
  await expect(selected).toHaveCount(0);
  await expect(createBtn).toHaveCount(0);
  expect(api.count("POST", "/api/share-links")).toBe(0);
  await expect(listTab(0)).toBeVisible();
  await listTab(0).click();
  await expect(page.getByText("候補の『共有リストに入れる』を押すと、ここに並びます")).toBeVisible();
  await expect(createBtn).toHaveCount(0);

  // ② 1 → 3 → 1 つ外す → 全部外す（選択中の数が 1 → 3 → 2 → 0）
  await pickBtns.nth(0).click();
  await expect(listTab(1)).toBeVisible();
  await pickBtns.nth(1).click();
  await pickBtns.nth(2).click();
  await expect(listTab(3)).toBeVisible();
  await pickBtns.nth(1).click(); // 1 つ外す
  await expect(listTab(2)).toBeVisible();
  await pickBtns.nth(0).click();
  await pickBtns.nth(2).click();
  await expect(listTab(0)).toBeVisible();
  await expect(selected).toHaveCount(0);
  await expect(createBtn).toHaveCount(0);
  expect(api.count("POST", "/api/share-links")).toBe(0);

  // ③ 1 件選んで「共有リストを作る」を押す。作成中にもう 1 回押しても、POST は 1 回だけ
  await pickBtns.nth(0).click();
  await expect(listTab(1)).toBeVisible();
  await listTab(1).click();
  await expect(createBtn).toBeEnabled();
  const urlBefore = page.url();
  await page.evaluate(() => ((window as unknown as { __ve02: number }).__ve02 = 1)); // 再読込・遷移をしていない印
  await createBtn.click();
  await expect(createBtn).toHaveText("作成中…");
  await expect(createBtn).toBeDisabled();
  await createBtn.click({ force: true, timeout: 2000 }); // 押せない（無反応）
  await testInfo.attach("ve02-creating", { body: await page.screenshot(), contentType: "image/png" });

  // ④ 成功: 遷移・再読込なし（URL が変わらない）。リンクとコピーボタンが出て、作成ボタンが再び押せる
  await expect(page.getByRole("button", { name: "コピー" })).toBeVisible();
  await expect(createBtn).toHaveText("共有リストを作る");
  await expect(createBtn).toBeEnabled();
  const link = page.locator("a[href$='/s/AbCdEfGhIjKlMnOpQrStUv']");
  await expect(link).toBeVisible();
  await expect(link).toHaveText(/\/s\/AbCdEfGhIjKlMnOpQrStUv$/);
  expect(page.url()).toBe(urlBefore);
  expect(await page.evaluate(() => (window as unknown as { __ve02?: number }).__ve02)).toBe(1);
  expect(api.count("POST", "/api/share-links")).toBe(1); // 作成中の 2 回目の押下で増えていない
  await testInfo.attach("ve02-success", { body: await page.screenshot(), contentType: "image/png" });
});
