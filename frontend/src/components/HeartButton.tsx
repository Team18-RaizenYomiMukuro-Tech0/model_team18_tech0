"use client";

import { useFavorites } from "@/state/favorites";
import styles from "./favorites.module.css";

// D-30 SP-13 F-15: カード・詳細のハート。押すたびに登録・解除。すべてのハートとパネルは同じ保存を見るので同期する。
// 色だけに頼らず、♡（未登録）と♥（登録済み）で形も変える。押す場所は縦横 44px 以上。
export function HeartButton({ productId, name }: Readonly<{ productId: string; name?: string }>) {
  const { has, toggle } = useFavorites();
  const on = has(productId);
  const label = name ? `${name}をお気に入り` : "お気に入り";
  return (
    <button type="button" className={styles.heart} aria-pressed={on} aria-label={label} onClick={() => toggle(productId)}>
      <span aria-hidden="true">{on ? "♥" : "♡"}</span>
    </button>
  );
}
