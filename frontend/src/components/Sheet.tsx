"use client";

import { useEffect, useRef } from "react";
import styles from "./results.module.css";

// D-46 SP-29: 下から出るシート（詳細・共有リスト）。`role="dialog"`・閉じるボタン・Esc・背景を押して閉じる。
// 開いたらシートへ焦点を移し（中身が読めたら見出しへ。DetailPanel）、Tab はシートの中だけを回る。閉じたら開いたときの要素（押したカード・帯のボタン）へ戻す。
// open=false のときは隠すだけで、中身は消さない（共有リストの作成中の状態や作ったリンクが消えないように）。
export function Sheet({ open = true, label, onClose, children }: Readonly<{ open?: boolean; label: string; onClose: () => void; children: React.ReactNode }>) {
  const frame = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose; // 親が作り直した onClose を使う（開閉の副作用は作り直さない）
  });

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // 後ろの画面は動かさない
    frame.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close.current();
      } else if (e.key === "Tab" && frame.current) {
        const f = [...frame.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex="0"]')].filter((x) => x.offsetParent !== null);
        if (f.length === 0) return;
        const a = document.activeElement;
        if (e.shiftKey && (a === f[0] || a === frame.current)) {
          e.preventDefault();
          f[f.length - 1].focus();
        } else if (!e.shiftKey && a === f[f.length - 1]) {
          e.preventDefault();
          f[0].focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      if (opener?.isConnected) opener.focus();
    };
  }, [open]);

  return (
    <div hidden={!open}>
      <div className={styles.scrim} onClick={onClose} aria-hidden="true" />
      <div ref={frame} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} className={styles.sheet}>
        <div className={styles.sheethead}>
          <button type="button" className={styles.sheetclose} onClick={onClose}>
            閉じる
          </button>
        </div>
        <div className={styles.sheetscroll}>{children}</div>
      </div>
    </div>
  );
}
