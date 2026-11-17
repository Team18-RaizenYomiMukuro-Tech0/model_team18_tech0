"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { bubbleLeft, SHARE_HELP_LABEL, SHARE_HELP_TEXT } from "@/lib/shareHelp";
import styles from "./pick.module.css";

// F-47 SP-04 SP-30: カードの「共有リストに入れる」（R-01・R-02・トップのおすすめで同じ）と、その横の「？」。
// ボタンの文言: 「共有リストに入れる」、押した後「✓ リストに入れた」（もう一度押すと外れる）。「？」を押すとボタンのすぐ上に短い説明のふきだしを出し、
// 外を押す・もう一度「？」を押す・Esc・画面を動かすと消える（画面をふさがない）。「？」は見た目 20px の丸をボタンの右上に寄せ、押せる範囲は透明な余白で 44px。
export function PickControl({ name, picked, onToggle, help = true }: Readonly<{ name: string; picked: boolean; onToggle: () => void; help?: boolean }>) {
  const [open, setOpen] = useState(false);
  const row = useRef<HTMLDivElement>(null);
  const q = useRef<HTMLButtonElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const id = useId();
  // ふきだしは「？」のすぐ上に出す（position: fixed。画面の左右 8px の内側に収める）
  useLayoutEffect(() => {
    const b = bubble.current;
    const a = q.current;
    if (!open || !b || !a) return;
    const r = a.getBoundingClientRect();
    b.style.left = `${bubbleLeft(r.right - b.offsetWidth, b.offsetWidth, document.documentElement.clientWidth)}px`;
    b.style.bottom = `${window.innerHeight - r.top + 6}px`;
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!row.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        q.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);
  return (
    <div className={styles.row} ref={row}>
      <button type="button" className={styles.pick} aria-pressed={picked} onClick={onToggle}>
        {picked ? "✓ リストに入れた" : "共有リストに入れる"}
        <span className={styles.vh}>（{name}）</span>
      </button>
      {help && (
        <>
          <button ref={q} type="button" className={styles.help} aria-label={SHARE_HELP_LABEL} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
            <span className={styles.helpdot} aria-hidden="true">？</span>
          </button>
          {open && (
            <div ref={bubble} id={id} role="note" className={styles.bubble}>
              {SHARE_HELP_TEXT}
            </div>
          )}
        </>
      )}
    </div>
  );
}
