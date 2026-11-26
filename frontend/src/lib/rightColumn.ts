// R5 SP-29 D-46: PC（900px 以上）の検索結果 R-01 の右の列のタブ。React を使わない純粋な部分（文言・キー操作・件数の読み上げ）。

export type RightTab = "detail" | "list";
export const RIGHT_TABS: readonly RightTab[] = ["detail", "list"]; // 左が「詳細」、右が「共有リスト（N件）」（PM 11/15）

export const RIGHT_COLUMN_LABEL = "右の列";
/** 「カードを押す前」の詳細タブの案内（A。確定 PM 11/15） */
export const DETAIL_HINT = "カードを押すと、ここに詳細が出ます";
/** 0 件の共有リストのタブの案内 */
export const LIST_EMPTY_HINT = "候補の『共有リストに入れる』を押すと、ここに並びます";

/** タブの読み上げの名前（aria-label）。件数は共有リストのタブの名前に含める（詳細を見ている間も件数が見える。F-38） */
export function tabLabel(tab: RightTab, picked: number): string {
  return tab === "detail" ? "詳細" : `共有リスト ${picked}件`;
}

/** タブの見える文字。共有リストは「共有リスト」だけ（件数は 1 件以上のとき、アイコンと数の丸で見せる） */
export function tabText(tab: RightTab): string {
  return tab === "detail" ? "詳細" : "共有リスト";
}

/** 共有リストのタブに、共有のアイコンと数の丸を出すか（1 件以上のとき） */
export function showTabBadge(tab: RightTab, picked: number): boolean {
  return tab === "list" && picked > 0;
}

/** ← → で隣へ（端は反対側へ回る）。Home で先頭、End で末尾。それ以外のキーは null（何もしない） */
export function nextTab(current: RightTab, key: string): RightTab | null {
  const i = RIGHT_TABS.indexOf(current);
  const n = RIGHT_TABS.length;
  if (key === "ArrowRight") return RIGHT_TABS[(i + 1) % n];
  if (key === "ArrowLeft") return RIGHT_TABS[(i + n - 1) % n];
  if (key === "Home") return RIGHT_TABS[0];
  if (key === "End") return RIGHT_TABS[n - 1];
  return null;
}

/** 件数が変わったときの読み上げ（見えない role=status の欄）。増えたら「入れました」、減ったら「外しました」。変わらなければ空 */
export function pickedAnnouncement(prev: number, next: number): string {
  if (next > prev) return `共有リストに入れました（${next}件）`;
  if (next < prev) return `外しました（${next}件）`;
  return "";
}
