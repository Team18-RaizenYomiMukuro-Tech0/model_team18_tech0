// SP-28 D-09（7個目-16・ツッコミ-19）: 演出中に画面の回転・タブを離れる（hidden）があれば、演出を閉じる（出し直さない）。
// 閉じ方は押す・Esc と同じ close。戻り値の関数で listener を全部外す。
type Mq = { addEventListener(type: "change", l: () => void): void; removeEventListener(type: "change", l: () => void): void };
type Doc = { visibilityState?: string; addEventListener(type: "visibilitychange", l: () => void): void; removeEventListener(type: "visibilitychange", l: () => void): void };

export function closeOnLeave(close: () => void, mq: Mq | null, doc: Doc): () => void {
  const onRotate = () => close();
  const onVis = () => {
    if (doc.visibilityState === "hidden") close();
  };
  mq?.addEventListener("change", onRotate);
  doc.addEventListener("visibilitychange", onVis);
  return () => {
    mq?.removeEventListener("change", onRotate);
    doc.removeEventListener("visibilitychange", onVis);
  };
}
