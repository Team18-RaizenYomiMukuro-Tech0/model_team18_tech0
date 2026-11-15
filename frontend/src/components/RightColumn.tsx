"use client";

import { useEffect, useId, useRef, useState } from "react";
import { DETAIL_HINT, LIST_EMPTY_HINT, RIGHT_COLUMN_LABEL, RIGHT_TABS, nextTab, pickedAnnouncement, tabLabel, type RightTab } from "@/lib/rightColumn";
import { DetailPanel } from "./DetailPanel";
import { SelectedList } from "./SelectedList";
import styles from "./results.module.css";

// R5 SP-29 D-46 F-38: PC（900px 以上）の R-01 の右の列。上に「詳細」（左）「共有リスト（N件）」（右）のタブ、下に選んだタブの中身。
// role=tablist／tab／tabpanel。選んでいるタブだけ tabindex=0（Tab はこの列の中で 1 回だけ止まる）。← → で隣へ移ると同時に切り替わり、Home・End で先頭・末尾。
// 2 つの中身は両方描いたまま使わない側を hidden にする（作った共有リンクや選択が切り替えで消えない）。切り替えたら中身のスクロールは先頭へ戻す。
// タブの状態は URL に入れない。最初はいつも詳細（持ち主は CandidateResults）。件数が変わったら見えない role=status で読み上げる。
export function RightColumn({
  tab,
  onTab,
  detailId,
  onCloseDetail,
  focusKey,
  picked,
}: Readonly<{ tab: RightTab; onTab: (t: RightTab) => void; detailId: string | null; onCloseDetail: () => void; focusKey: number | null; picked: number }>) {
  const uid = useId();
  const tabId = (t: RightTab) => `${uid}-tab-${t}`;
  const panelId = (t: RightTab) => `${uid}-panel-${t}`;
  const tabEls = useRef<Record<RightTab, HTMLButtonElement | null>>({ detail: null, list: null });
  const panels = useRef<Record<RightTab, HTMLDivElement | null>>({ detail: null, list: null });
  // 件数の読み上げ: 描画の途中で前の件数と比べる（効果の中で state を替えない）
  const [seen, setSeen] = useState(picked);
  const [said, setSaid] = useState("");
  if (seen !== picked) {
    setSeen(picked);
    setSaid(pickedAnnouncement(seen, picked));
  }

  // 切り替えたら、出た側の中身のスクロールを先頭へ戻す（隠れているあいだは動かせないので、出たあとで）
  useEffect(() => {
    const p = panels.current[tab];
    if (p) p.scrollTop = 0;
  }, [tab]);
  const select = (t: RightTab, focus: boolean) => {
    if (t !== tab) onTab(t);
    if (focus) tabEls.current[t]?.focus();
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const to = nextTab(tab, e.key);
    if (!to) return;
    e.preventDefault();
    select(to, true);
  };

  return (
    <div className={styles.rcol}>
      <div role="tablist" aria-label={RIGHT_COLUMN_LABEL} className={styles.tablist} onKeyDown={onKeyDown}>
        {RIGHT_TABS.map((t) => (
          <button
            key={t}
            ref={(el) => {
              tabEls.current[t] = el;
            }}
            id={tabId(t)}
            type="button"
            role="tab"
            className={styles.tab}
            aria-selected={tab === t}
            aria-controls={panelId(t)}
            tabIndex={tab === t ? 0 : -1}
            onClick={() => select(t, false)}
          >
            {tabLabel(t, picked)}
          </button>
        ))}
      </div>
      <div
        ref={(el) => {
          panels.current.detail = el;
        }}
        id={panelId("detail")}
        role="tabpanel"
        aria-labelledby={tabId("detail")}
        tabIndex={0}
        hidden={tab !== "detail"}
        className={styles.tabpanel}
      >
        {detailId != null ? <DetailPanel productId={detailId} onClose={onCloseDetail} focusKey={focusKey} /> : <p className={styles.tabhint}>{DETAIL_HINT}</p>}
      </div>
      <div
        ref={(el) => {
          panels.current.list = el;
        }}
        id={panelId("list")}
        role="tabpanel"
        aria-labelledby={tabId("list")}
        tabIndex={0}
        hidden={tab !== "list"}
        className={styles.tabpanel}
      >
        {picked === 0 && <p className={styles.tabhint}>{LIST_EMPTY_HINT}</p>}
        <SelectedList />
      </div>
      <p role="status" aria-live="polite" className={styles.vh}>
        {said}
      </p>
    </div>
  );
}
