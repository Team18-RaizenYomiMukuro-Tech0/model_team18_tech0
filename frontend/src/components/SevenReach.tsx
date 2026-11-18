"use client";
/* eslint-disable @next/next/no-img-element -- 動く gif と静止画をそのまま使う（Image の最適化は gif を止める。LikeRow と同じ） */

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { LIKE_GIF, LIKE_GIF_STILL, SEVEN_REACH } from "@/lib/sharedLink";
import { closeOnLeave } from "@/lib/effectClose";
import styles from "./sevenReach.module.css";

// SP-28 D-09 7 個目の演出「B リーチからの大当たり」。画面全体を覆う層（aria-hidden）。押す・Esc・時間が来るで閉じる。
// 動きは Web Animations API。時間（setTimeout）は 1 つで、閉じる・外れるときに必ず消す。音・計測は無い。
const GOLD = "#FFD34D";
const REEL_H = 84;
const SYMBOL_ORDER = ["akabu", "♥", "7"] as const; // 各リールは 3 つの絵柄の繰り返しで、最後（止まる所）が 7

function Symbol({ s }: Readonly<{ s: string }>) {
  if (s === "akabu") return <img src={LIKE_GIF_STILL} alt="" width={56} height={56} className={styles.symface} />;
  return <span className={s === "7" ? styles.sym7 : styles.symheart}>{s}</span>;
}

const REELS = [
  { cycles: 4, ms: 600, ease: "cubic-bezier(.2,.7,.3,1)" },
  { cycles: 5, ms: 800, ease: "cubic-bezier(.2,.7,.3,1)" },
  { cycles: 8, ms: 2700, ease: "cubic-bezier(.1,.75,.15,1)" }, // 右だけ最後に減速してゆっくり止まる
] as const;

export function SevenReach({ onClose }: Readonly<{ onClose: () => void }>) {
  const root = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const T = SEVEN_REACH.totalMs;
    const anims: Animation[] = [];
    const play = (sel: string, kf: Keyframe[], o: KeyframeAnimationOptions) => {
      el.querySelectorAll<HTMLElement>(sel).forEach((n) => anims.push(n.animate(kf, { fill: "both", ...o })));
    };
    play("[data-a=dim]", [{ opacity: 0 }, { opacity: 1, offset: 0.08 }, { opacity: 1, offset: 0.9 }, { opacity: 0 }], { duration: T, easing: "linear" });
    play("[data-a=box]", [{ transform: "translate(-50%,-50%) scale(.6)", opacity: 0 }, { transform: "translate(-50%,-50%) scale(1)", opacity: 1, offset: 0.09 }, { transform: "translate(-50%,-50%) scale(1)", opacity: 1, offset: 0.95 }, { transform: "translate(-50%,-50%) scale(1)", opacity: 0 }], { duration: 2750, easing: "ease-out" });
    play("[data-a=glow]", [{ boxShadow: "0 0 0 2px rgba(255,211,77,.35)" }, { boxShadow: `0 0 0 4px ${GOLD}, 0 0 28px ${GOLD}` }, { boxShadow: "0 0 0 2px rgba(255,211,77,.35)" }], { duration: 500, delay: 850, iterations: 3 });
    REELS.forEach((r, i) => {
      const n = r.cycles * 3;
      play(`[data-reel="${i}"]`, [{ transform: "translateY(0)" }, { transform: `translateY(${-(n - 1) * REEL_H}px)` }], { duration: r.ms, easing: r.ease });
    });
    play("[data-a=reach]", [{ opacity: 0, transform: "translate(-50%,-30px) scale(.8)" }, { opacity: 1, transform: "translate(-50%,0) scale(1.1)", offset: 0.15 }, { opacity: 1, transform: "translate(-50%,0) scale(1)", offset: 0.85 }, { opacity: 0, transform: "translate(-50%,0) scale(1)" }], { duration: 1700, delay: 850 });
    play("[data-a=flash]", [{ opacity: 0 }, { opacity: 0.85, offset: 0.25 }, { opacity: 0 }], { duration: 520, delay: 2750 });
    play("[data-a=big]", [
      { opacity: 0, transform: "translate(-50%,-50%) scale(.2) rotate(0deg)" },
      { opacity: 1, transform: "translate(-50%,-50%) scale(1.15) rotate(-6deg)", offset: 0.25 },
      { opacity: 1, transform: "translate(-50%,-50%) scale(1) rotate(4deg)", offset: 0.5 },
      { opacity: 1, transform: "translate(-50%,-50%) scale(1) rotate(0deg)", offset: 0.7 },
      { opacity: 0, transform: "translate(-50%,-50%) scale(1.4) rotate(0deg)" },
    ], { duration: 1900, delay: 2750 });
    play("[data-a=win]", [{ opacity: 0, transform: "translate(-50%,10px)" }, { opacity: 1, transform: "translate(-50%,0)", offset: 0.2 }, { opacity: 1, transform: "translate(-50%,0)", offset: 0.8 }, { opacity: 0, transform: "translate(-50%,0)" }], { duration: 1800, delay: 2750 });
    el.querySelectorAll<HTMLElement>("[data-ring]").forEach((n) => {
      const a = (Number(n.dataset.ring) / SEVEN_REACH.ringCount) * Math.PI * 2;
      const at = (r: number) => `translate(-50%,-50%) translate(${Math.cos(a) * r}px,${Math.sin(a) * r}px)`;
      anims.push(n.animate([{ opacity: 0, transform: at(0) }, { opacity: 1, transform: at(150), offset: 0.25 }, { opacity: 0, transform: at(230) }], { duration: 1700, delay: 2900, fill: "both", easing: "ease-out" }));
    });

    // 時間・押す・Esc・外れるのどれでも、予約を全部消して外す。Esc は後ろの詳細パネルの Esc より先に受けて止める
    const timer = window.setTimeout(() => close.current(), T);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      close.current();
    };
    window.addEventListener("keydown", onKey, true);
    const stopLeave = closeOnLeave(() => close.current(), window.matchMedia("(orientation: portrait)"), document); // 回転・タブを離れるで閉じる（出し直さない）
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // 演出中はページを動かさない
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey, true);
      stopLeave();
      document.body.style.overflow = prev;
      anims.forEach((a) => a.cancel());
    };
  }, []);

  // 層は body 直下に出し、ヘッダー・固定帯・詳細パネルも覆う。押した場所の下の操作は動かさない（押しは層が受けて閉じるだけ）
  return createPortal(
    <div ref={root} className={styles.layer} aria-hidden="true" data-testid="seven-reach" onClick={() => close.current()}>
      <div className={styles.dim} data-a="dim" />
      <div className={styles.flash} data-a="flash" />
      <div className={styles.box} data-a="box">
        <div className={styles.boxglow} data-a="glow" />
        {REELS.map((r, i) => (
          <div key={i} className={styles.reel}>
            <div className={styles.strip} data-reel={i}>
              {Array.from({ length: r.cycles * 3 }, (_, k) => (
                <div key={k} className={styles.cell}>
                  <Symbol s={SYMBOL_ORDER[k % 3]} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className={styles.reach} data-a="reach">
        {SEVEN_REACH.reach}
      </div>
      <img src={LIKE_GIF} alt="" width={SEVEN_REACH.bigPx} height={SEVEN_REACH.bigPx} className={styles.big} data-a="big" />
      {Array.from({ length: SEVEN_REACH.ringCount }, (_, i) => (
        <img key={i} src={LIKE_GIF} alt="" width={SEVEN_REACH.ringPx} height={SEVEN_REACH.ringPx} className={styles.ring} data-ring={i} />
      ))}
      <div className={styles.win} data-a="win">
        {SEVEN_REACH.win}
      </div>
      <div className={styles.hint}>{SEVEN_REACH.hint}</div>
    </div>,
    document.body,
  );
}
