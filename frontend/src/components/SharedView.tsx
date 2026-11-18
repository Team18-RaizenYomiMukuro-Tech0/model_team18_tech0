"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatPrice } from "@/lib/formatPrice";
import { canShowDetail, DETAIL_LABEL, fetchShared, itemImage, itemNote, LIKE_FAILED_MESSAGE, LikeController, OTHERS_HREF, OTHERS_LABEL, addSevenMark, SEVEN_REACH, SHARED_GUIDE, sevenReachMode, type LikeView, type SharedItem, type SharedResult } from "@/lib/sharedLink";
import { DetailPanel } from "./DetailPanel";
import { LikeRow } from "./LikeRow";
import { SevenReach } from "./SevenReach";
import styles from "./shared.module.css";

// SP-06 F-05 N-01 D-09 N-15: 共有リンクを開いたときの画面。読み込み中 → 表示／期限切れ／見つからない／失敗。
// 第2弾 F-33: 各商品に「くわしく見る」（販売終了には置かない）、一覧の下に「ほかの贈りものも探す」（期限切れ・見つからないにも置く）。
// 購入・LINE 直送・延長・再発行・取り消しのボタンは置かない（文書で置かないと決めた）。
export function SharedView({ shareId }: Readonly<{ shareId: string }>) {
  const [state, setState] = useState<{ id: string; r: SharedResult | null }>({ id: shareId, r: null });
  const [tries, setTries] = useState(0);

  useEffect(() => {
    const abort = new AbortController();
    fetchShared(shareId, abort.signal).then((r) => {
      if (!abort.signal.aborted) setState({ id: shareId, r });
    });
    return () => abort.abort();
  }, [shareId, tries]);

  const r = state.id === shareId ? state.r : null;

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>贈りもの候補</h1>
      {!r && (
        <p role="status" className={styles.msg}>
          読み込み中
        </p>
      )}
      {r?.status === "ok" && (
        <>
          <p className={styles.guide}>{SHARED_GUIDE}</p>
          <p className={styles.lead}>作成時点の商品名・価格です</p>
          <SharedList key={`${shareId}:${tries}`} shareId={shareId} items={r.items} />
          <p className={styles.public}>このページはリンクを知っている人なら誰でも見られます</p>
          <OthersLink />
        </>
      )}
      {r?.status === "expired" && (
        <div role="status" className={styles.msg}>
          <p className={styles.msgmain}>このリンクは期限切れです</p>
          <p>作った人に、新しいリンクを頼んでください</p>
          <OthersLink />
        </div>
      )}
      {r?.status === "notfound" && (
        <div role="status" className={styles.msg}>
          <p className={styles.msgmain}>リンクが見つかりません</p>
          <OthersLink />
        </div>
      )}
      {r?.status === "error" && (
        <div role="alert" className={styles.err}>
          失敗しました。もう一度お試しください
          <button
            type="button"
            className={styles.btn}
            onClick={() => {
              setState({ id: shareId, r: null });
              setTries(tries + 1);
            }}
          >
            再試行
          </button>
        </div>
      )}
    </div>
  );
}

function OthersLink() {
  return (
    <Link href={OTHERS_HREF} className={styles.others}>
      {OTHERS_LABEL}
    </Link>
  );
}

// 各候補の本体といいね（SP-28）。「表示」のときだけ出る。数は開いたときに読んだ値（like_count。無ければ 0）
function SharedList({ shareId, items }: Readonly<{ shareId: string; items: readonly SharedItem[] }>) {
  // 共有ページの「表示」は読み込んだあとにだけ出るので、保存（印）は最初の描画で読んでよい。親は共有 ID・再試行ごとに作り直す（key）
  const [likes, setLikes] = useState<Readonly<Record<string, LikeView>> | null>(null);
  const [c] = useState(() => new LikeController(shareId, items, browserStorage(), (v) => setLikes(v)));
  const view = likes ?? c.snapshot;
  const [openId, setOpenId] = useState<string | null>(null); // #410 SP-06: 詳細は共有ページの上で開く（URL は変えない）
  const openView = openId ? view[openId] : null;
  // SP-28 D-09: 7 個目の演出。商品ごと・7 になるたびに出す（印は持たない）。layer＝全画面の層、mark＝動きを減らす版の「7 7 7」（2 秒）
  const [reach, setReach] = useState(false); // 全画面の層を出しているか（動きを減らさない版）
  const [marks, setMarks] = useState<readonly string[]>([]); // 動きを減らす版の「7 7 7」を出している商品 ID（商品ごとに 2 秒）
  const marksRef = useRef<readonly string[]>([]);
  const back = useRef<HTMLElement | null>(null); // 閉じたあとに焦点を戻す、押した「いいね」のボタン
  const markTimers = useRef<Set<number>>(new Set());
  useEffect(() => {
    const timers = markTimers.current;
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []);
  const press = async (id: string, button: HTMLElement) => {
    if (!(await c.toggle(id))) return; // 成功して数がちょうど 7 になったときだけ（数と段 8 は toggle の中で先に確定している）
    const mode = sevenReachMode({ reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches, canAnimate: typeof Element.prototype.animate === "function" });
    if (mode === "mark") {
      const r = addSevenMark(marksRef.current, id);
      if (!r.start) return; // 同じ商品の印が出ている間にもう一度 7 になっても、出し直さず今の印の時間のまま
      marksRef.current = r.marks;
      setMarks(r.marks);
      const t = window.setTimeout(() => {
        markTimers.current.delete(t);
        marksRef.current = marksRef.current.filter((x) => x !== id);
        setMarks(marksRef.current);
      }, SEVEN_REACH.reducedMs);
      markTimers.current.add(t);
    } else {
      back.current = button;
      setReach(true);
    }
  };
  const closeReach = () => {
    setReach(false);
    const b = back.current;
    back.current = null;
    if (b?.isConnected) requestAnimationFrame(() => b.focus()); // 層が外れたあとに押した「いいね」へ焦点を戻す
  };
  const markOf = (id: string) => marks.includes(id);
  return (
    <>
    <ol className={styles.list}>
      {items.map((it) => {
        const note = itemNote(it.status);
        const v = view[it.product_id] ?? { count: it.like_count ?? 0, liked: false, failed: false };
        return (
          <li key={it.product_id} className={styles.item}>
            {itemImage(it) && (
              <div className={styles.img}>
                <Image src={itemImage(it) ?? ""} alt="" width={200} height={200} unoptimized />
                <span className={styles.imgtag}>イメージ</span>
              </div>
            )}
            <h2 className={styles.name}>{it.name}</h2>
            <p className={styles.price}>{formatPrice(it.price)}</p>
            {it.reason && <p className={styles.reason}>{it.reason}</p>}
            {note && <p className={styles.note}>{note}</p>}
            <div className={styles.actions}>
              {canShowDetail(it.status) && (
                <button type="button" className={styles.link} onClick={() => setOpenId(it.product_id)}>
                  {DETAIL_LABEL}
                </button>
              )}
              <LikeRow v={v} mark={markOf(it.product_id)} onToggle={(b) => void press(it.product_id, b)} />
            </div>
            {v.failed && (
              <p role="alert" className={styles.likeErr}>
                {LIKE_FAILED_MESSAGE}
              </p>
            )}
          </li>
        );
      })}
    </ol>
    {openId && openView && <DetailPanel key={openId} productId={openId} onClose={() => setOpenId(null)} like={{ view: openView, mark: markOf(openId), onToggle: (b) => void press(openId, b) }} />}
    {reach && <SevenReach onClose={closeReach} />}
    </>
  );
}

function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null; // 保存を使えなくても押せる（印は残らない）
  }
}
