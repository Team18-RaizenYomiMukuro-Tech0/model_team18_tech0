import { test, expect, fixture } from "./api";

// VE-05 S-26・S-62（SP-13。U-43・V-07・V-09）: お気に入り。テスト設計.md「画面の通し確認」VE-05。1280px。
// 保存先はブラウザ内の localStorage。保存が使えないときの動きは V-08 が受け持つので、ここでは見ない。

test.use({
  apiOverrides: {
    candidates: (q) => (q.has("price_band") ? { body: fixture("candidates-songbetsu-3000to4999.json") } : { body: fixture("candidates-songbetsu.json") }),
  },
});

test("VE-05 S-26 S-62 お気に入りは、カード・詳細・パネルで同期し、重複せず、再読込後も残る", async ({ page }, testInfo) => {
  const NAME = "P01の贈りもの"; // トップのおすすめの先頭 4 件（P01〜P04）にも、送別 8 件の結果にもある商品
  const heartLabel = `${NAME}をお気に入り`;
  const dialog = page.getByRole("dialog", { name: "お気に入り" });
  const openPanel = async () => {
    await page.getByRole("button", { name: "お気に入り", exact: true }).click();
    await expect(dialog).toBeVisible();
  };
  const closePanel = async () => {
    await dialog.getByRole("button", { name: "閉じる" }).click();
    await expect(dialog).toHaveCount(0);
  };
  const topHeart = page.getByRole("list").locator("li").getByRole("button", { name: heartLabel });

  // ① トップのおすすめで P01 のハートを押して登録する
  await page.goto("/");
  await expect(topHeart).toBeVisible();
  await topHeart.click();
  await expect(topHeart).toHaveAttribute("aria-pressed", "true");

  // ② ヘッダーの「お気に入り」でパネルを開く。右から出るパネルに一覧が出る
  await openPanel();
  await expect(dialog.getByText("お気に入り（1件）")).toBeVisible();
  await expect(dialog.getByRole("link", { name: NAME })).toBeVisible();
  await expect.poll(async () => { // 右から滑り込む動きが終わるのを待つ
    const box = await dialog.boundingBox();
    return box !== null && box.x > 640 && box.x + box.width <= 1280.5;
  }).toBe(true); // 画面の右半分に出る

  // ③ パネルで外すと、一覧から消え、ハートも未登録に戻る
  await dialog.getByRole("button", { name: `${NAME}を外す` }).click();
  await expect(dialog.getByText("まだ登録した商品はありません。")).toBeVisible();
  await closePanel();
  await expect(topHeart).toHaveAttribute("aria-pressed", "false");

  // ④ カードのハートで登録 → 同じ商品の詳細を開く → 詳細のハートが登録済みで出る。パネルの一覧は 1 件のまま（重複しない）。詳細のハートは押さない
  await page.getByRole("group", { name: "シーン" }).getByRole("button", { name: "送別" }).click();
  await expect(page.getByRole("heading", { name: "候補（11件）" })).toBeVisible();
  await page.getByRole("button", { name: "3,000〜4,999円" }).click();
  await expect(page.getByRole("heading", { name: "候補（8件）" })).toBeVisible();
  const cardHeart = page.locator("li").getByRole("button", { name: heartLabel });
  await expect(cardHeart).toHaveAttribute("aria-pressed", "false");
  await cardHeart.click();
  await expect(cardHeart).toHaveAttribute("aria-pressed", "true");
  await page.locator("li").getByRole("link", { name: NAME }).click();
  const detailHeart = page.getByRole("tabpanel").getByRole("button", { name: heartLabel });
  await expect(detailHeart).toBeVisible();
  await expect(detailHeart).toHaveAttribute("aria-pressed", "true");
  await openPanel();
  await expect(dialog.getByText("お気に入り（1件）")).toBeVisible();
  await expect(dialog.getByRole("link", { name: NAME })).toHaveCount(1);
  await closePanel();

  // ⑤ 再読込（page.reload()）しても残る
  await page.reload();
  await expect(page.getByRole("tabpanel").getByRole("button", { name: heartLabel })).toHaveAttribute("aria-pressed", "true");
  await openPanel();
  await expect(dialog.getByText("お気に入り（1件）")).toBeVisible();
  await expect(dialog.getByRole("link", { name: NAME })).toBeVisible();
  await testInfo.attach("ve05-after-reload", { body: await page.screenshot(), contentType: "image/png" });
  await closePanel();

  // ⑥ 同じ商品を、カードと詳細の 2 か所のハートで見る。どちらを押しても、両方が同期する
  await expect(cardHeart).toHaveAttribute("aria-pressed", "true");
  await detailHeart.click(); // 詳細で外す → カードも未登録
  await expect(detailHeart).toHaveAttribute("aria-pressed", "false");
  await expect(cardHeart).toHaveAttribute("aria-pressed", "false");
  await cardHeart.click(); // カードで登録 → 詳細も登録
  await expect(cardHeart).toHaveAttribute("aria-pressed", "true");
  await expect(detailHeart).toHaveAttribute("aria-pressed", "true");
});
