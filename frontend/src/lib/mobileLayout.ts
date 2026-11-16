// R2 SP-29 SP-31 D-46: スマホ・タブレット幅の並べ方の文言と幅の境目。画面の部品はここから取る（値を 1 か所に）。
import { CATEGORIES } from "./images.ts";
import { PRICE_BANDS } from "./priceBand.ts";
import type { SearchQuery } from "./searchQuery.ts";

/** 詳細はシート＋下端の帯にする幅（899px 以下。SP-29）。900px 以上は右の欄 */
export const SHEET_MAX_WIDTH = 899;
/** 条件を 1 行にたたむ幅（480px 以下。SP-31） */
export const COLLAPSE_MAX_WIDTH = 480;

/** SP-31: 条件の 1 行。選んでいなければ「条件を選ぶ ▼」。ほかは「{条件を「・」でつないだもの} ▼ 絞り込み」（順は シーン・価格・カテゴリー） */
export function conditionSummary(q: Pick<SearchQuery, "scene" | "priceBand" | "categories">): string {
  const parts: string[] = [];
  if (q.scene) parts.push(q.scene);
  const band = PRICE_BANDS.find((b) => b.value === q.priceBand);
  if (band) parts.push(band.label);
  for (const c of CATEGORIES) if (q.categories.includes(c.name)) parts.push(c.name); // タイルの並び順（選んだ順にしない。D-08）
  return parts.length === 0 ? "条件を選ぶ ▼" : `${parts.join("・")} ▼ 絞り込み`;
}

/** SP-29: 下端の帯の左。R-01 で 1 件以上のときだけ（それ以外は null） */
export function listBandText(isR01: boolean, picked: number): string | null {
  return isR01 && picked >= 1 ? `共有リスト ${picked}件` : null;
}

/** SP-29: 下端の帯の右。n はカートに入っている商品の種類の数（数量の合計ではない） */
export function cartBandText(kinds: number): string {
  return `カート（${kinds}点）`;
}

/** NF-47: 共有リストのシートを閉じ終えたあと、焦点を帯「共有リスト N件」へ戻すか（閉じる操作があり、シートがもう出ていないときだけ。帯は閉じ終えてから戻る） */
export function shouldFocusListBand(listShown: boolean, closedByUser: boolean): boolean {
  return closedByUser && !listShown;
}
