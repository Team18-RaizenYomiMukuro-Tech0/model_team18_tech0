// F-47 SP-04: 「共有リストに入れる」の横の「？」。押すとボタンのすぐ上にふきだしで出す短い説明（PM 2026-11-17「2c」の文言案）。文言は 1 か所に置く
export const SHARE_HELP_LABEL = "共有リストとは";
export const SHARE_HELP_TEXT = "選んだ候補をリンクにして、LINE などで仲間に送れます。仲間は登録なしで見て、いいねで答えられます";

// ふきだしを画面の左右 8px の内側に収める左端（anchorLeft: 「？」の左端、width: ふきだしの幅、viewport: 画面の幅）
export function bubbleLeft(anchorLeft: number, width: number, viewport: number): number {
  const max = viewport - 8 - width;
  return Math.max(8, Math.min(anchorLeft, max));
}
