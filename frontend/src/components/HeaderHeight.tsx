"use client";
import { useEffect } from "react";

// D-46 SP-08: 固定したヘッダーの実測の高さを CSS の値 --hh に入れる（幅で変わる。数字を決め打ちしない）。
// 右の列・詳細の欄の sticky の top と max-height、scroll-padding-top がこの値を使う。
export function HeaderHeight() {
  useEffect(() => {
    const h = document.querySelector("header.top");
    if (!h) return;
    const set = () => document.documentElement.style.setProperty("--hh", `${Math.round(h.getBoundingClientRect().height)}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(h);
    return () => ro.disconnect();
  }, []);
  return null;
}
