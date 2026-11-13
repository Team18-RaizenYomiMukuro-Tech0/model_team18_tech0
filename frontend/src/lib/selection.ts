import type { CandidateItem } from "./api.ts";
import type { Candidate } from "../state/selection.ts";

// F2 D-08 D-15 N-06 #36: 選んだ候補の数の決まり（React を使わない純粋な部分）。
// 選ぶ数に上限は無い。共有リンクに入れられるのは10件まで（11件以上は作成ボタンを押せない）。
export const SHARE_LIMIT = 10;
export const OVER_LIMIT_MESSAGE = "共有リンクに入れられるのは10件までです。選ぶ数を減らしてください";

export const isOverLimit = (count: number): boolean => count > SHARE_LIMIT;

// 作成ボタンを押せるのは 1〜10 件のときだけ（0件はボタン自体を出さない。#76）
export const canCreate = (count: number, creating = false): boolean => count >= 1 && !isOverLimit(count) && !creating;

// 選んだ時点の表示用の情報（商品ID・商品名・価格・category・high_rating・理由）に写す
export function toCandidate(i: CandidateItem): Candidate {
  return { productId: i.product_id, name: i.name, price: i.price, reason: i.reason, category: i.category, highRating: i.high_rating };
}
