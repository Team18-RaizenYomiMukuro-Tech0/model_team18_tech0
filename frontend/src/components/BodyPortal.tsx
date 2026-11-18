"use client";
import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

const subscribe = () => () => {};

// D-31 D-46 #485: ヘッダーの重なり（sticky・z-index 20）の外、body 直下に出す。
// カートの通知とパネルが詳細の暗幕 39・シート／パネル 40 の後ろに隠れないようにする。サーバーでは何も出さない。
export function BodyPortal({ children }: Readonly<{ children: ReactNode }>) {
  const client = useSyncExternalStore(subscribe, () => true, () => false);
  return client ? createPortal(children, document.body) : null;
}
