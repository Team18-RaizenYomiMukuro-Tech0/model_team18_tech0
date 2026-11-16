"use client";

import { cartStore } from "@/state/cart";
import styles from "./cardParts.module.css";

// R6 SP-30 U-85: カードの「カートに入れる」。押しても詳細は開かない（別のボタン）。SP-14 の追加と同じ動き（同じ商品は数量+1、通知）。
// 在庫なし（inStock が false）は押せない。縦横 44px 以上。名前は読み上げ用に付ける（ハート・共有リストに入れると同じ）。
export function CartButton({ productId, name, inStock = true }: Readonly<{ productId: string; name: string; inStock?: boolean }>) {
  return (
    <button type="button" className={styles.cartbtn} disabled={!inStock} onClick={() => cartStore.add(productId)}>
      カートに入れる
      <span className={styles.vh}>（{name}）</span>
    </button>
  );
}
