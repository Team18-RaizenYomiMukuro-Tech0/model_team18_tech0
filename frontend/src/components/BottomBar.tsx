"use client";

import { useEffect } from "react";
import { cartBandText, listBandText } from "@/lib/mobileLayout";
import { useCart } from "@/state/cart";
import styles from "./results.module.css";

// SP-29 D-46: 899px 以下の検索結果の下端に固定する 1 本の帯。左「共有リスト {n}件」（R-01・R-02 のどちらでも 1 件以上のときだけ。押すと共有リストのシート。#488）、
// 右「カート（{n}点）」（いつも。{n} は種類の数。押すと SP-14 のカートを開く）。出すのは検索結果だけで、シートを開いている間は出さない。
// カートのパネルはヘッダーのカートのボタンが持っているので、そのボタンを押す（パネルの作りは変えない。D9 の持ち物）。
export function BottomBar({ picked, onOpenList }: Readonly<{ picked: number; onOpenList: () => void }>) {
  const { count } = useCart();
  // SP-29 ⑤: 帯がある間は、通知を帯の上に出す（cart.module.css の .toastBox が body[data-band] を見る）
  useEffect(() => {
    document.body.dataset.band = "1";
    return () => {
      delete document.body.dataset.band;
    };
  }, []);
  const list = listBandText(picked);
  const openCart = () => document.querySelector<HTMLButtonElement>('header.top button[aria-label="カート"]')?.click();
  return (
    <nav className={styles.band} aria-label="共有リストとカート">
      {list && (
        <button type="button" className={styles.bandbtn} data-band="list" onClick={onOpenList}>
          {list}
        </button>
      )}
      <button type="button" className={styles.bandbtn} data-primary="true" onClick={openCart}>
        {cartBandText(count)}
      </button>
    </nav>
  );
}
