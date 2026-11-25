import { test, expect, fixture } from "./api";

// VE-04 S-60（SP-11。U-41・V-21）: シーンなしの検索結果（R-02）のページ送り。テスト設計.md「画面の通し確認」VE-04。1280px。
// `/search?price_band=3000to4999` を直接開き（未決 6）、そのあとは「次へ」・ページ番号・「前へ」で進む。FD-9 の 31 件（12 / 12 / 7）。

const all = fixture<{ product_id: string }[]>("fd9-products-3000to4999.json");
const names = (from: number, to: number) => all.slice(from, to).map((p) => `${p.product_id}の贈りもの`);

test("VE-04 S-60 シーンなしの 31 件を 12 / 12 / 7 件でページ送りでき、条件は変わらない", async ({ page, api }, testInfo) => {
  const cards = page.getByRole("list").locator("li").getByRole("link", { name: /の贈りもの$/ });
  const pager = page.getByRole("navigation", { name: "ページ送り" });
  const bandBtn = page.getByRole("button", { name: /3,000〜4,999円/ });
  const sceneBtns = page.getByRole("group", { name: "シーン" }).getByRole("button");
  const rangeTexts: string[] = [];
  const conditionsHold = async () => {
    await expect(bandBtn).toHaveAttribute("aria-pressed", "true"); // 価格帯は 3,000〜4,999円のまま
    for (const b of await sceneBtns.all()) await expect(b).toHaveAttribute("aria-pressed", "false"); // シーンは選ばれていない
  };

  // ① 直接開く。1 ページ目は 12 件。下に「全31件中1〜12件を表示」・ページ番号・「次へ」
  await page.goto("/search?price_band=3000to4999");
  await expect(cards).toHaveText(names(0, 12));
  await expect(sceneBtns).toHaveCount(3); // 「お礼」「誕生日」「送別」。どれも選ばれていない
  const range = pager.locator("p");
  await expect(range).toHaveText("全31件中1〜12件を表示");
  rangeTexts.push(await range.innerText());
  await expect(pager.getByRole("link", { name: "次へ" })).toBeVisible();
  for (const n of ["1", "2", "3"]) await expect(pager.getByRole("link", { name: n, exact: true })).toBeVisible();
  await conditionsHold();
  expect(api.last("GET", "/api/products")?.search.get("price_band")).toBe("3000to4999");

  // ② 「次へ」で 2 ページ目（13〜24 件）
  await pager.getByRole("link", { name: "次へ" }).click();
  await expect(cards).toHaveText(names(12, 24));
  await expect(range).toHaveText("全31件中13〜24件を表示");
  rangeTexts.push(await range.innerText());
  await conditionsHold();

  // ③ ページ番号 3 で 3 ページ目（25〜31 件。残り 7 件）。「次へ」は押せない
  await pager.getByRole("link", { name: "3", exact: true }).click();
  await expect(cards).toHaveText(names(24, 31));
  await expect(cards).toHaveCount(7);
  await expect(range).toHaveText("全31件中25〜31件を表示");
  rangeTexts.push(await range.innerText());
  await expect(pager.getByRole("link", { name: "次へ" })).toHaveCount(0);
  await expect(pager.getByText("次へ")).toHaveAttribute("aria-disabled", "true");
  await conditionsHold();
  await testInfo.attach("ve04-page3", { body: await page.screenshot(), contentType: "image/png" });

  // ④ 「前へ」で戻る。同じページの同じ商品が出る
  await pager.getByRole("link", { name: "前へ" }).click();
  await expect(cards).toHaveText(names(12, 24));
  await expect(range).toHaveText("全31件中13〜24件を表示");
  await conditionsHold();
  expect(rangeTexts).toEqual(["全31件中1〜12件を表示", "全31件中13〜24件を表示", "全31件中25〜31件を表示"]);
});
