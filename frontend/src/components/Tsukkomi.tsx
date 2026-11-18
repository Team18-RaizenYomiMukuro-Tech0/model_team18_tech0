"use client";
/* eslint-disable @next/next/no-img-element -- 動く gif をそのまま使う（Image の最適化は gif を止める。SevenReach と同じ） */

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { LIKE_GIF, TSUKKOMI } from "@/lib/sharedLink";
import { Harisen } from "./Harisen";
import styles from "./tsukkomi.module.css";

// SP-28 D-09 8 個目以上のツッコミ「B1 ハリセンでスパーン」。画面全体を覆う層（aria-hidden）。押す・Esc・時間（2.45 秒）で閉じる。
// 動きは Web Animations API。時間（setTimeout）は 1 つで、閉じる・外れるときに必ず消す。音・計測は無い。
// anchor＝押した「いいね」のボタン。その行のいいねの数（[data-likecount]）へ振り下ろす
const FACE_BORDER = 4;

export function Tsukkomi({ anchor, onClose }: Readonly<{ anchor: HTMLElement | null; onClose: () => void }>) {
  const root = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const W = el.clientWidth;
    const count = anchor?.closest("[data-likerow]")?.querySelector<HTMLElement>("[data-likecount]") ?? anchor;
    const cr = count?.getBoundingClientRect();
    const target = cr ? { x: cr.left + cr.width / 2, y: cr.top + cr.height / 2 } : { x: W / 2, y: el.clientHeight / 2 };
    const FACE = TSUKKOMI.faceBigPx;
    const faceTop = Math.max(70, target.y - 95);
    const faceLeft = W - FACE - 12;
    const hand = { x: faceLeft + 10, y: faceTop + 72 };
    const rot = (Math.atan2(target.y - hand.y, target.x - hand.x) * 180) / Math.PI - 180; // 当てる角度
    const R = (d: number) => `rotate(${(rot + d).toFixed(1)}deg)`;

    const anims: Animation[] = [];
    const a = (n: Element | null | undefined, kf: Keyframe[], o: KeyframeAnimationOptions) => {
      if (n) anims.push(n.animate(kf, { fill: "forwards", easing: "ease-out", ...o }));
    };
    const q = (sel: string) => el.querySelector<HTMLElement>(sel);
    const faces = q("[data-a=face]");
    const harisen = q("[data-a=harisen]");
    const impact = q("[data-a=impact]");
    const bubble = q("[data-a=bubble]");
    const lines = q("[data-a=lines]");
    if (harisen) {
      harisen.style.left = `${hand.x - 150}px`;
      harisen.style.top = `${hand.y - 45}px`;
    }
    if (faces) {
      faces.style.left = `${faceLeft}px`;
      faces.style.top = `${faceTop}px`;
    }
    if (impact) {
      impact.style.left = `${Math.min(Math.max(0, W - 260), Math.max(0, target.x - 30 - 130))}px`;
      impact.style.top = `${target.y - 100}px`;
    }
    if (bubble) bubble.style.top = `${faceTop - 70}px`;
    if (lines) lines.style.background = `repeating-conic-gradient(from 0deg at ${target.x}px ${target.y}px, rgba(255,255,255,0) 0deg 6deg, rgba(255,255,255,.45) 6deg 8deg)`;

    const T0 = 340; // 登場が終わる
    const T1 = 660; // 振り下ろし 0.11 秒の始まり
    const T2 = 770; // 当たり
    const T3 = 1150; // 吹き出し
    const T4 = 2050; // 退場
    // 暗さ・案内
    a(q("[data-a=dim]"), [{ opacity: 0 }, { opacity: 1 }, { opacity: 1, offset: 0.9 }, { opacity: 0 }], { duration: TSUKKOMI.totalMs, easing: "linear" });
    a(q("[data-a=hint]"), [{ opacity: 0 }, { opacity: 0.8, offset: 0.08 }, { opacity: 0.8, offset: 0.9 }, { opacity: 0 }], { duration: TSUKKOMI.totalMs, easing: "linear" });
    // あかぷさん
    const enter = ["translateX(200px)", "translateX(-8px)", "translateX(0)"];
    const exit = (from: string, to: string): Keyframe[] => [{ opacity: 1, transform: from }, { opacity: 1, transform: from, offset: 0.3 }, { opacity: 0, transform: to }];
    a(faces, enter.map((t, i) => ({ opacity: 1, transform: t, offset: [0, 0.8, 1][i] })), { duration: 320 });
    a(faces, [{ opacity: 1, transform: "rotate(0deg)" }, { opacity: 1, transform: "translateX(6px) rotate(10deg)" }], { duration: 240, delay: T0 });
    a(faces, [{ opacity: 1, transform: "translateX(6px) rotate(10deg)" }, { opacity: 1, transform: "translateX(-10px) rotate(-12deg)" }], { duration: 110, delay: T1, easing: "ease-in" });
    a(faces, [{ opacity: 1, transform: "translateX(-10px) rotate(-12deg)" }, { opacity: 1, transform: "translateX(0) rotate(0deg)" }], { duration: 300, delay: T2 + 120, easing: "cubic-bezier(.3,1.5,.5,1)" });
    a(faces, exit("translateX(0)", "translateX(200px)"), { duration: 360, delay: T4, easing: "ease-in" });
    // ハリセン（肩 +70 度 → 振りかぶり +125 度 → 当たり −6 度 → しなって跳ね返る）
    a(harisen, enter.map((t, i) => ({ opacity: 1, transform: `${t} ${R(70)}`, offset: [0, 0.8, 1][i] })), { duration: 320 });
    a(harisen, [{ opacity: 1, transform: R(70) }, { opacity: 1, transform: R(125) }], { duration: 240, delay: T0, easing: "cubic-bezier(.2,.8,.3,1)" });
    a(harisen, [{ opacity: 1, transform: R(125) }, { opacity: 1, transform: R(-6) }], { duration: 110, delay: T1, easing: "cubic-bezier(.7,0,1,.5)" });
    a(harisen, [{ opacity: 1, transform: `${R(-6)} scale(1,.82)` }, { opacity: 1, transform: `${R(14)} scale(1,1.05)`, offset: 0.45 }, { opacity: 1, transform: R(4) }], { duration: 260, delay: T2 });
    a(harisen, exit(R(4), `translateX(200px) ${R(70)}`), { duration: 360, delay: T4, easing: "ease-in" });
    // 残像 2 枚（不透明 .32・.18。0.17 秒・0.20 秒。20ms・40ms 遅れる）
    el.querySelectorAll<HTMLElement>("[data-a=ghost]").forEach((g, i) => {
      g.style.left = `${hand.x - 150}px`;
      g.style.top = `${hand.y - 45}px`;
      a(g, [{ opacity: 0, transform: R(125) }, { opacity: 0.32 - i * 0.14, transform: R(30 + i * 22), offset: 0.7 }, { opacity: 0, transform: R(2 + i * 6) }], { duration: 170 + i * 30, delay: T1 + 20 + i * 20, easing: "linear" });
    });
    // 当たり: 数がつぶれる（値は変えない）・画面が揺れる・集中線・スパーン！
    const squash = count?.animate([{ transform: "scale(1)" }, { transform: "scale(1.7,.45)" }, { transform: "scale(.85,1.3)" }, { transform: "scale(1)" }], { duration: 320, delay: T2 });
    if (squash) anims.push(squash);
    a(lines, [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 0 }], { duration: 450, delay: T2 });
    a(impact, [{ opacity: 0, transform: "scale(2.4) rotate(-8deg)" }, { opacity: 1, transform: "scale(1) rotate(-8deg)", offset: 0.25 }, { opacity: 1, transform: "scale(1) rotate(-8deg)", offset: 0.8 }, { opacity: 0, transform: "scale(1.1) rotate(-8deg)" }], { duration: 800, delay: T2 });
    // 画面の揺れ: 位置が static の body 直下の要素だけ relative にして left/top を動かす（transform だと固定の帯・パネルが動いてしまうため）
    const m = 9;
    Array.from(document.body.children).forEach((c) => {
      if (c === el || !(c instanceof HTMLElement) || getComputedStyle(c).position !== "static") return;
      const p = (x: number, y: number): Keyframe => ({ position: "relative", left: `${x}px`, top: `${y}px` });
      anims.push(c.animate([p(0, 0), p(-m, m * 0.8), p(m * 0.9, -m * 0.6), p(-m * 0.5, m * 0.3), p(0, 0)], { duration: 320, delay: T2 }));
    });
    // 大きな吹き出し
    a(bubble, [{ opacity: 0, transform: "scale(.3) rotate(-10deg)" }, { opacity: 1, transform: "scale(1.15) rotate(3deg)", offset: 0.6 }, { opacity: 1, transform: "scale(1) rotate(-3deg)" }], { duration: 300, delay: T3, easing: "cubic-bezier(.3,1.6,.5,1)" });
    a(bubble, [{ opacity: 1, transform: "scale(1) rotate(-3deg)" }, { opacity: 0, transform: "scale(1) rotate(-3deg)" }], { duration: 200, delay: T4 });

    // 時間・押す・Esc・外れるのどれでも、予約を全部消して外す。Esc は後ろの詳細パネルの Esc より先に受けて止める
    const timer = window.setTimeout(() => close.current(), TSUKKOMI.totalMs);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      close.current();
    };
    window.addEventListener("keydown", onKey, true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // 演出中はページを動かさない
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prev;
      anims.forEach((x) => x.cancel());
    };
  }, [anchor]);

  // 層は body 直下に出し、ヘッダー・固定帯・詳細パネルも覆う。押した場所の下の操作は動かさない
  return createPortal(
    <div ref={root} className={styles.layer} aria-hidden="true" data-testid="tsukkomi" onClick={() => close.current()}>
      <div className={styles.dim} data-a="dim" />
      <div className={styles.lines} data-a="lines" />
      {[0, 1].map((i) => (
        <div key={i} className={styles.harisen} data-a="ghost">
          <Harisen uid={`g${i}`} />
        </div>
      ))}
      <div className={styles.harisen} data-a="harisen">
        <Harisen uid="main" />
      </div>
      <img src={LIKE_GIF} alt="" width={TSUKKOMI.faceBigPx} height={TSUKKOMI.faceBigPx} className={styles.face} data-a="face" style={{ borderWidth: FACE_BORDER }} />
      <div className={styles.impact} data-a="impact">
        {TSUKKOMI.impact}
      </div>
      <div className={styles.bubble} data-a="bubble">
        {TSUKKOMI.line}
      </div>
      <div className={styles.hint} data-a="hint">
        {TSUKKOMI.hint}
      </div>
    </div>,
    document.body,
  );
}
