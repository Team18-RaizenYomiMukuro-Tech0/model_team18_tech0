// R7 #116 SP-09 SP-11 #39-2: 画像の置き場と名前は、このファイルの1か所だけに書く。
// 画像はすべてリポジトリの frontend/public/ から同じサイトで読む（外部のサイトから読み込まない）。

// DB の category の10種類。並びは T-5（仕様 SP-09・設計 D-37）: トップ・検索結果、PC・スマホで共通の 1 か所。
// 先頭の 4 つ（食品・飲料・生活雑貨・フラワー）が、トップのスマホ幅で最初に出す 4 つ。残りの 6 つが「ほか6個」。
export const CATEGORIES = [
  { name: "食品", slug: "food" },
  { name: "飲料", slug: "drink" },
  { name: "生活雑貨", slug: "living" },
  { name: "フラワー", slug: "flower" },
  { name: "コスメ", slug: "cosme" },
  { name: "酒類", slug: "liquor" },
  { name: "インテリア", slug: "interior" },
  { name: "家電", slug: "appliance" },
  { name: "ビジネス小物", slug: "business" },
  { name: "カタログギフト", slug: "catalog" },
] as const;

export type CategoryName = (typeof CATEGORIES)[number]["name"];

export const HERO_IMAGE = "/hero/hero.svg";

// カテゴリーのアイコン（トップのタイル用）
export function categoryIcon(name: string): string | null {
  const c = CATEGORIES.find((x) => x.name === name);
  return c ? `/categories/${c.slug}.svg` : null;
}

// 商品カードのカテゴリー共通イラスト（画像は API から返さず画面が出す。OPEN-06）。表記「イメージ」はカード側で付ける。
export function productImage(category: string): string | null {
  const c = CATEGORIES.find((x) => x.name === category);
  return c ? `/products/${c.slug}.svg` : null;
}

// 検索中の「あかぷさん」画像（レージが後で渡す）。届いたら frontend/public/akapu/ に置き、
// ここを "/akapu/akapu.png" のように書き換える1か所だけで差し替わる。null のあいだは CSS の回る輪を出す。
export const AKAPU_IMAGE: string | null = "/akapu/akapu.png";
