import { test, expect, fixture, type Overrides } from "./api";

// VE-01 S-01（S-05。SP-01・SP-10）: トップ → 送別のタイル → 価格帯。テスト設計.md「画面の通し確認」VE-01。1280px。

const band = fixture<{ items: { product_id: string }[] }>("candidates-songbetsu-3000to4999.json");
const noBand = fixture<unknown>("candidates-songbetsu.json");

const candidates: Overrides["candidates"] = (q) => {
  if (q.get("scene") !== "送別") return null;
  if (!q.has("price_band")) return { body: noBand };
  if (q.get("price_band") === "3000to4999") return { body: band, delayMs: 800 }; // 2 つ目の応答は遅らせる
  return null;
};
test.use({ apiOverrides: { candidates } });

test("VE-01 S-01 トップで送別と価格帯を押すと、候補（8件）が応答の順に出る", async ({ page, api }, testInfo) => {
  // ① トップを開く
  await page.goto("/");
  const tiles = page.getByRole("group", { name: "シーン" }).getByRole("button");
  await expect(tiles).toHaveText(["お礼", "誕生日", "送別"]);
  await expect(page.getByRole("button", { name: "候補を出す" })).toHaveCount(0);

  // ② 「送別」のタイルを押す。押した時点で検索結果の画面に候補が出る
  await tiles.filter({ hasText: "送別" }).click();
  await expect(page).toHaveURL(/\/search/);
  await expect(page.getByRole("heading", { name: "候補（11件）" })).toBeVisible();
  await expect(page.getByRole("button", { name: "候補を出す" })).toHaveCount(0);

  // ③ 価格帯「3,000〜4,999円」を押す。その場で出し直す（検索中 → 結果あり）
  await page.getByRole("button", { name: "3,000〜4,999円" }).click();
  await expect(page.getByRole("status").filter({ hasText: "検索中" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "候補（8件）" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "検索中" })).toHaveCount(0);
  await testInfo.attach("ve01-after-band", { body: await page.screenshot(), contentType: "image/png" });

  // 価格が「4,999円（税込）」の形。並びは応答の順で、P09 が先頭。P04・P05・P06・P12・P13 は出ない
  await expect(page.getByText("4,999円（税込）")).toBeVisible();
  const names = page.getByRole("list").locator("li").getByRole("link", { name: /の贈りもの$/ });
  await expect(names.first()).toHaveText("P09の贈りもの");
  const shown = await names.allInnerTexts();
  expect(shown).toEqual(band.items.map((i) => `${i.product_id}の贈りもの`));
  for (const gone of ["P04", "P05", "P06", "P12", "P13"]) expect(shown).not.toContain(`${gone}の贈りもの`);

  // 最後の /api/candidates の要求に scene と price_band が付く
  const last = api.last("GET", "/api/candidates");
  expect(last?.search.get("scene")).toBe("送別");
  expect(last?.search.get("price_band")).toBe("3000to4999");
});
