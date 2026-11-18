// SP-31: トップから検索結果へ移ったとき、スマホ幅の条件の欄を「開いた状態」で始めるための印。
// 画面の中（ページ移動のあいだ）だけ覚える。再読込や、直接 /search を開いたときは印が無く、今までどおり閉じた状態で始まる。
let openOnArrival = false;

/** トップのシーン・カテゴリー・価格帯から検索結果へ移る直前に呼ぶ */
export function markFoldOpen(): void {
  openOnArrival = true;
}

/** 検索結果の条件の欄が最初に開いているか（読むだけ。消すのは clearFoldOpen） */
export function foldOpenOnArrival(): boolean {
  return openOnArrival;
}

/** 条件の欄が出たら印を消す（次に別の道で来たときに開いたままにしない） */
export function clearFoldOpen(): void {
  openOnArrival = false;
}
