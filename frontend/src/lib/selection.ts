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
export function toCandidate(i: CandidateItem, scene: string | null = null): Candidate {
  return { productId: i.product_id, name: i.name, price: i.price, reason: i.reason, category: i.category, highRating: i.high_rating, ...(scene ? { scene } : {}) };
}

// F-47: シーンなしの一覧（R-02）・トップのおすすめ・詳細から選ぶとき（理由の文は共有リンクを作るときに API が作る。ここでは持たない）
export function productCandidate(p: { product_id: string; name: string; price: number; category: string; high_rating?: boolean }): Candidate {
  return { productId: p.product_id, name: p.name, price: p.price, category: p.category, highRating: p.high_rating };
}

// F-47 SP-05 D-05: 共有リンクを作るときに送る scene。選んだ候補がどれも同じシーンのときだけそのシーン、
// シーンが混ざる・無い（R-02 などで選んだ）ときは送らない（API がシーンに触れない文で保存する）。仕様に書かれていない混ざったときの扱いは PR に記載
export function shareScene(picked: readonly Candidate[]): string | null {
  const first = picked[0]?.scene ?? null;
  if (!first) return null;
  return picked.every((c) => c.scene === first) ? first : null;
}

// SP-05 D-08 #482（PM 11/18 1A・2A・3A）: リンクを作ったあとに共有リストが変わったときの案内。「変わった」＝作成時に送った商品 ID の並び（順番を含む）と、今の共有リストの並びが違う。
// 元の並びに戻せば false（案内は消える）。まだリンクを作っていない（sent が null）ときは false。
export const SHARE_CHANGED_MESSAGE = "共有リストを変更しました。変更後のリストを送るには、もう一度『共有リストを作る』を押してください。表示中のリンクは変更前のリストのままです。";
export function shareListChanged(sent: readonly string[] | null, current: readonly string[]): boolean {
  if (sent === null) return false;
  return sent.length !== current.length || sent.some((id, i) => id !== current[i]);
}

// SelectedList が create に渡す 2 つの値（商品 ID を選んだ順に・scene）。画面の部品は .tsx でテストできないので、ここに出して確かめる（#427）
export function shareArgs(picked: readonly Candidate[]): [string[], string | null] {
  return [picked.map((c) => c.productId), shareScene(picked)];
}
