import { arrivesText } from "./arrival.ts";
import type { SceneCount } from "./api.ts";

// R4 SP-16 D-34: 決め手の 1 行（部品 DecisionChips の中身。React を使わない部分）。文言と並びはここの 1 か所（N-14）。
// 並び: ①届く日（目安） ②ラッピング可 ③在庫あり ④{シーン}で{n}回。値が null・false・0 の決め手は出さない（値を作らない。OPEN-06）。
// カードと詳細で同じ値・並び・文言になるよう、どちらもこの関数を通す。
export type Chip = { key: "arrives" | "wrap" | "stock" | "scene"; icon: "box" | "ribbon" | null; text: string };

export type ChipInput = {
  arrivesOn?: string | null;
  wrapping?: boolean | null;
  /** 在庫あり（stock が 1 以上）。一覧は在庫 0 を出さないので、カードは true。詳細は status が available のとき true */
  inStock?: boolean;
  /** シーンを選んでいる画面だけ（R-01 のカード・R-01 から開いた詳細）。選んでいなければ null か無し */
  sceneCount?: SceneCount | null;
};

export function decisionChips(i: ChipInput): Chip[] {
  const out: Chip[] = [];
  const a = arrivesText(i.arrivesOn);
  if (a) out.push({ key: "arrives", icon: "box", text: a });
  if (i.wrapping === true) out.push({ key: "wrap", icon: "ribbon", text: "ラッピング可" });
  if (i.inStock === true) out.push({ key: "stock", icon: null, text: "在庫あり" });
  const s = i.sceneCount;
  if (s && Number.isFinite(s.n) && s.n >= 1) out.push({ key: "scene", icon: null, text: `${s.scene}で${s.n}回` });
  return out;
}
