import { test, expect } from "./api";

// VE-06 S-63（SP-14。U-44・U-50・V-10〜V-12）: カート。テスト設計.md「画面の通し確認」VE-06。1280px。
// 販売終了・在庫なし、数量の欄に空・0・小数・数字以外を入れたとき、「注文へ進む」は V-10〜V-12・U-50 が受け持つので、ここでは見ない。

test("VE-06 S-63 カートに入れて数量を 1〜99 で変え、100 以上は 99 に直り、削除で空になる", async ({ page }, testInfo) => {
  const NAME = "P01の贈りもの"; // 価格 4,999 円。トップのおすすめの先頭
  const dialog = page.getByRole("dialog", { name: "カート" });
  const qty = dialog.getByRole("textbox", { name: `${NAME}の数量` });
  const up = dialog.getByRole("button", { name: `${NAME}の数量を1増やす` });

  // ① 「カートに入れる」で数量 1。同じ商品をもう一度で数量 2
  await page.goto("/");
  const add = page.getByRole("button", { name: new RegExp(`^カートに入れる\\s*（${NAME}）$`) });
  await add.click();
  await add.click();

  // ② ヘッダーのカートを押す。右から出るパネル。数量 2・合計（税込）が合う（4,999 × 2 ＝ 9,998円）
  await page.getByRole("button", { name: "カート", exact: true }).click();
  await expect(dialog.getByText("カート（1件）")).toBeVisible();
  await expect(qty).toHaveValue("2");
  await expect(dialog.getByText("合計").locator("b")).toHaveText("9,998円（税込）");
  await expect.poll(async () => { // 右から滑り込む動きが終わるのを待つ
    const box = await dialog.boundingBox();
    return box !== null && box.x > 640 && box.x + box.width <= 1280.5;
  }).toBe(true);
  await testInfo.attach("ve06-cart", { body: await page.screenshot(), contentType: "image/png" });

  // ③ 数量を 99 まで増やす。99 のとき「1増やす」が押せない
  for (let n = 3; n <= 99; n++) await up.click();
  await expect(qty).toHaveValue("99");
  await expect(up).toBeDisabled();
  await expect(dialog.getByText("合計").locator("b")).toHaveText("494,901円（税込）"); // 4,999 × 99

  // ④ 数量の欄に 100 を直接入力して欄を離れると 99 に直る。150 も同じ（間に 5 へ下げて、直った結果だと分かるようにする）
  await qty.fill("5");
  await qty.blur();
  await expect(qty).toHaveValue("5");
  await qty.fill("100");
  await qty.blur();
  await expect(qty).toHaveValue("99");
  await qty.fill("5");
  await qty.blur();
  await expect(qty).toHaveValue("5");
  await qty.fill("150");
  await qty.blur();
  await expect(qty).toHaveValue("99");

  // ⑤ 削除で行が消え、「カートに入っている商品はありません。」。見出しは「カート（0件）」
  await dialog.getByRole("button", { name: `${NAME}を削除` }).click();
  await expect(dialog.getByText("カートに入っている商品はありません。")).toBeVisible();
  await expect(dialog.getByText("カート（0件）")).toBeVisible();
  await testInfo.attach("ve06-empty", { body: await page.screenshot(), contentType: "image/png" });
});
