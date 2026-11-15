"use client";

import { useSyncExternalStore } from "react";

// 幅の境目（lib/mobileLayout.ts の SHEET_MAX_WIDTH など）で表示を切り替える。サーバー側の描画では false（広い幅）。
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
