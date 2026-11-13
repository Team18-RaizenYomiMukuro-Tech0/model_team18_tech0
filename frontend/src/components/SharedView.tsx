"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/formatPrice";
import { fetchShared, itemNote, type SharedResult } from "@/lib/sharedLink";
import styles from "./shared.module.css";

// SP-06 F-05 N-01 D-09 N-15: 共有リンクを開いたときの画面。読み込み中 → 表示／期限切れ／見つからない／失敗。
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
          <p className={styles.lead}>作成時点の商品名・価格です</p>
          <ol className={styles.list}>
            {r.items.map((it) => {
              const note = itemNote(it.status);
              return (
                <li key={it.product_id} className={styles.item}>
                  <h2 className={styles.name}>{it.name}</h2>
                  <p className={styles.price}>{formatPrice(it.price)}</p>
                  <p className={styles.reason}>{it.reason}</p>
                  {note && <p className={styles.note}>{note}</p>}
                </li>
              );
            })}
          </ol>
          <p className={styles.public}>このページはリンクを知っている人なら誰でも見られます</p>
        </>
      )}
      {r?.status === "expired" && (
        <div role="status" className={styles.msg}>
          <p className={styles.msgmain}>このリンクは期限切れです</p>
          <p>作った人に、新しいリンクを頼んでください</p>
        </div>
      )}
      {r?.status === "notfound" && (
        <div role="status" className={styles.msg}>
          <p className={styles.msgmain}>リンクが見つかりません</p>
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
