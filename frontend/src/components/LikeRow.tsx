"use client";

import { LIKE_GIF, LIKE_GIF_STILL, likeGifs, likeLabel, type LikeView } from "@/lib/sharedLink";
import styles from "./shared.module.css";

// 共有一覧と、共有ページの上で開く詳細パネルで同じ（PM 11/18 1B）。
// SP-06 D-09（PM 11/18）: いいねボタンのマークを指定の画像にし、いいねの数だけ（5 個まで。6 個目から「＋N」）ボタンのすぐ横に並べる。
// 読み上げはボタンが「いいね」（aria-label・aria-pressed）。並んだ画像は飾り（aria-hidden）で、数は文字で読める。動きを減らす設定では静止画。
export function LikeGif({ size, alt = "" }: Readonly<{ size: number; alt?: string }>) {
  return (
    <picture>
      <source media="(prefers-reduced-motion: reduce)" srcSet={LIKE_GIF_STILL} />
      <img src={LIKE_GIF} alt={alt} width={size} height={size} className={styles.likegif} />
    </picture>
  );
}

export function LikeRow({ v, onToggle, buttonClass, primary }: Readonly<{ v: LikeView; onToggle: () => void; buttonClass?: string; primary?: boolean }>) {
  const g = likeGifs(v.count);
  return (
    <span className={styles.likerow}>
      <button type="button" className={buttonClass ?? styles.like} data-primary={primary ? "true" : undefined} aria-label="いいね" aria-pressed={v.liked} onClick={onToggle}>
        <LikeGif size={28} alt="いいね" /> {likeLabel(v.liked)}
      </button>
      <span className={styles.likecount}>
        <span className={styles.vh}>いいねの数 </span>
        {v.count}
      </span>
      {g.shown > 0 && (
        <span className={styles.gifs} aria-hidden="true">
          {Array.from({ length: g.shown }, (_, i) => (
            <LikeGif key={i} size={32} />
          ))}
          {g.more > 0 && <span className={styles.gifmore}>＋{g.more}</span>}
        </span>
      )}
    </span>
  );
}
