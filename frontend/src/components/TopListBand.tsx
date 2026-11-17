"use client";

import { useEffect, useRef, useState } from "react";
import { SHEET_MAX_WIDTH } from "@/lib/mobileLayout";
import { topBandText } from "@/lib/topBand";
import { useAppState } from "@/state/AppState";
import { SelectedList } from "./SelectedList";
import { Sheet } from "./Sheet";
import { useMediaQuery } from "./useMediaQuery";
import fav from "./favorites.module.css";
import styles from "./top.module.css";

// F-47 SP-04 SP-29 D-46: トップの下端の帯「共有リスト n件」（おすすめで 1 件以上入れたときだけ。「共有リスト n件」だけでカートは並べない）。
// 押すと共有リストを開く: 899px 以下は検索結果の帯と同じ（下から出るシート）、900px 以上は右から出るパネル（カート・お気に入りと同じ形）。
// 帯がある間は通知を帯の上（下端から 72px）に出す（body[data-band]。検索結果の帯と同じ）。閉じたら帯のボタンへ焦点を戻す。
export function TopListBand() {
  const { picked } = useAppState();
  const narrow = useMediaQuery(`(max-width: ${SHEET_MAX_WIDTH}px)`);
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const back = useRef(false);
  const n = picked.length;
  const shown = n > 0;
  const opened = open && shown; // 全部外したら、空のシート・パネルを残さない
  useEffect(() => {
    if (!shown) return;
    document.body.dataset.band = "1";
    return () => {
      delete document.body.dataset.band;
    };
  }, [shown]);
  useEffect(() => {
    if (opened || !back.current) return;
    back.current = false;
    btn.current?.focus();
  }, [opened, shown]);
  const close = () => {
    back.current = true;
    setOpen(false);
  };
  useEffect(() => {
    if (!opened || narrow) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [opened, narrow]);
  if (!shown) return null;
  return (
    <>
      <div className={styles.bandgap} aria-hidden="true" />
      {!opened && (
        <nav className={styles.topband} aria-label="共有リスト">
          <button ref={btn} type="button" className={styles.topbandbtn} data-band="list" onClick={() => setOpen(true)}>
            {topBandText(n)}
          </button>
        </nav>
      )}
      {narrow && opened && (
        <Sheet label="共有リスト" onClose={close}>
          <div className={styles.listpad}>
            <SelectedList />
          </div>
        </Sheet>
      )}
      {!narrow && opened && (
        <div className={fav.overlay} onClick={close}>
          <aside className={fav.panel} role="dialog" aria-label="共有リスト" onClick={(e) => e.stopPropagation()}>
            <div className={fav.head}>
              <b>共有リスト（{n}件）</b>
              <button type="button" className={fav.close} onClick={close} autoFocus>
                閉じる
              </button>
            </div>
            <SelectedList />
          </aside>
        </div>
      )}
    </>
  );
}
