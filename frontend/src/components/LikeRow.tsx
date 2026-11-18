"use client";

import { canResetLikes, LIKE_GIF, LIKE_GIF_STILL, likeGifs, likeLabel, RESET_LIKES, SEVEN_REACH, TSUKKOMI, type LikeView } from "@/lib/sharedLink";
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

// mark: 動きを減らす設定のときの「7 7 7」の印（数の横・金色の枠・読み上げない。D-09）。onToggle は押した「いいね」のボタンを受け取る（閉じたあとの焦点の戻し先）
// tmark: 動きを減らす設定のときの札「押しすぎやろ！」（数の右・赤字・白地・赤枠・読み上げない。D-09 ツッコミ）。onReset: 数が 7 以上のときだけ「6 個に戻す」を出す（画面の数だけ戻す。通信しない。D-09）
export function LikeRow({ v, onToggle, buttonClass, primary, mark = false, tmark = false, onReset }: Readonly<{ v: LikeView; onToggle: (button: HTMLButtonElement) => void; buttonClass?: string; primary?: boolean; mark?: boolean; tmark?: boolean; onReset?: () => void }>) {
  const g = likeGifs(v.count);
  return (
    <span className={styles.likerow} data-likerow>
      <button type="button" className={buttonClass ?? styles.like} data-primary={primary ? "true" : undefined} aria-label="いいね" aria-pressed={v.liked} onClick={(e) => onToggle(e.currentTarget)}>
        <LikeGif size={28} alt="いいね" /> {likeLabel(v.liked)}
      </button>
      <span className={styles.likecount} data-likecount>
        <span className={styles.vh}>いいねの数 </span>
        {v.count}
      </span>
      {tmark && (
        <span className={styles.tsukkomimark} aria-hidden="true">
          {TSUKKOMI.mark}
        </span>
      )}
      {onReset && canResetLikes(v.count) && (
        <button type="button" className={styles.reset} onClick={onReset}>
          {RESET_LIKES.label}
        </button>
      )}
      {mark && (
        <span className={styles.sevenmark} aria-hidden="true">
          {SEVEN_REACH.mark}
        </span>
      )}
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
