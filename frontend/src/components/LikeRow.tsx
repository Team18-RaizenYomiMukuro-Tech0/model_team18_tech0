"use client";

import { useEffect, useId, useRef } from "react";
import { canAddLike, canRemoveLike, canResetLikes, LIKE_GIF, LIKE_GIF_STILL, LIKE_MINUS_LABEL, LIKE_PER_BROWSER, likeGifs, likeLabel, likeLimitMessage, RESET_LIKES, SEVEN_REACH, TSUKKOMI, type LikeView } from "@/lib/sharedLink";
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

// mark: 動きを減らす設定のときの「7 7 7」の印（数の横・金色の枠・読み上げない。D-09）。onAdd は押した「いいね」のボタンを受け取る（閉じたあとの焦点の戻し先）
// tmark: 動きを減らす設定のときの札「押しすぎやろ！」（数の右・赤字・白地・赤枠・読み上げない。D-09 ツッコミ）。onReset: 数が 7 以上のときだけ「6 個に戻す」を出す（画面の数だけ戻す。通信しない。D-09）
// 1 人 5 個まで（SP-28 D-09。PM 11/19 #502）: 自分の個数を「3/5」で出し（読み上げは「自分のいいね 3 / 5」）、5 個または合計 30 で「いいね」は disabled にして理由をボタンのすぐ下に出す。
// 「−」は「いいね」のすぐ右の丸いボタン（44px 以上）で、自分が 1 個以上のときだけ出す（読み上げは「いいねを1つ減らす」）。
// フォーカス: 押したボタンに残す。「いいね」が押せなくなったら「−」へ、「−」が消えたら「いいね」へ移す（5個-4 A・5個-15 A）
export function LikeRow({ v, onAdd, onRemove, buttonClass, primary, mark = false, tmark = false, onReset }: Readonly<{ v: LikeView; onAdd: (button: HTMLButtonElement) => void; onRemove: () => void; buttonClass?: string; primary?: boolean; mark?: boolean; tmark?: boolean; onReset?: () => void }>) {
  const g = likeGifs(v.count);
  const canAdd = canAddLike(v.own, v.count);
  const canRemove = canRemoveLike(v.own);
  const limit = likeLimitMessage(v.own, v.count);
  const noteId = useId();
  const likeBtn = useRef<HTMLButtonElement>(null);
  const minusBtn = useRef<HTMLButtonElement>(null);
  const last = useRef<"like" | "minus" | null>(null); // 最後に押したボタン
  const prev = useRef({ canAdd, canRemove });
  useEffect(() => {
    const p = prev.current;
    prev.current = { canAdd, canRemove };
    if (p.canAdd && !canAdd && canRemove && last.current === "like") minusBtn.current?.focus(); // 「いいね」が押せなくなった → 「−」へ（5個-15 A）
    else if (p.canRemove && !canRemove && last.current === "minus") likeBtn.current?.focus(); // 「−」が消えた → 「いいね」へ（5個-4 A）
  }, [canAdd, canRemove]);
  return (
    <span className={styles.likerow}>
      <span className={styles.likecol}>
        <span className={styles.likebtns}>
          <button
            ref={likeBtn}
            type="button"
            className={buttonClass ?? styles.like}
            data-primary={primary ? "true" : undefined}
            aria-label="いいね"
            aria-pressed={v.own >= 1}
            aria-describedby={limit ? noteId : undefined}
            disabled={!canAdd}
            onClick={(e) => {
              last.current = "like";
              onAdd(e.currentTarget);
            }}
          >
            <LikeGif size={28} alt="いいね" /> {likeLabel(v.own >= 1)}
          </button>
          {canRemove && (
            <button
              ref={minusBtn}
              type="button"
              className={styles.minus}
              aria-label={LIKE_MINUS_LABEL}
              onClick={() => {
                last.current = "minus";
                onRemove();
              }}
            >
              −
            </button>
          )}
        </span>
        {limit && (
          <small id={noteId} className={styles.limit}>
            {limit}
          </small>
        )}
      </span>
      <span className={styles.likecount}>
        <span className={styles.vh}>いいねの数 </span>
        {v.count}
      </span>
      <span className={styles.own}>
        <span aria-hidden="true">
          {v.own}/{LIKE_PER_BROWSER}
        </span>
        <span className={styles.vh}>
          自分のいいね {v.own} / {LIKE_PER_BROWSER}
        </span>
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
