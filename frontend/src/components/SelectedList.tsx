"use client";

import { formatPrice } from "@/lib/formatPrice";
import { canCreate, isOverLimit, OVER_LIMIT_MESSAGE } from "@/lib/selection";
import { useAppState } from "@/state/AppState";
import styles from "./candidates.module.css";

// F2 D-08 #39-3 #41-5 #41-7 #36 #76: 「選んだ候補」の欄。検索結果の下。選んだ順に 商品名・価格（税込）・理由の文 と「外す」。
// 選んだ数を表示する。0件なら欄も作成ボタンも出さない。11件以上は作成ボタンのすぐ上に案内を出し、ボタンを押せなくする。
// リンクを作る処理は F3。ここでは onCreate を受け取るだけ（渡されなければ押しても何も起きない）。
export function SelectedList({ onCreate, creating = false }: Readonly<{ onCreate?: () => void; creating?: boolean }>) {
  const { picked, unpick } = useAppState();
  if (picked.length === 0) return null;
  const over = isOverLimit(picked.length);
  return (
    <section className={styles.selected} aria-labelledby="h-selected">
      <h2 id="h-selected" className={styles.sh}>
        選んだ候補
        <span className={styles.count} aria-live="polite">
          （{picked.length}件）
        </span>
      </h2>
      <ol className={styles.sel}>
        {picked.map((c) => (
          <li key={c.productId} className={styles.selrow}>
            <span className={styles.selbody}>
              <span className={styles.name}>{c.name}</span>
              <span className={styles.price}>{formatPrice(c.price)}</span>
              {c.reason && <span className={styles.reason}>{c.reason}</span>}
            </span>
            <button type="button" className={styles.remove} onClick={() => unpick(c.productId)}>
              外す<span className={styles.vh}>（{c.name}）</span>
            </button>
          </li>
        ))}
      </ol>
      {over && (
        <p className={styles.over} role="alert">
          {OVER_LIMIT_MESSAGE}
        </p>
      )}
      <button type="button" className={styles.create} disabled={!canCreate(picked.length, creating)} onClick={onCreate}>
        共有リンクを作る
      </button>
    </section>
  );
}
