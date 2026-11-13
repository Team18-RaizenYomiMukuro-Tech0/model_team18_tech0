"use client";

import { useEffect, useRef, useState } from "react";
import { formatPrice } from "@/lib/formatPrice";
import { lookupProduct, type Lookup } from "@/lib/productLookup";
import { useFavorites } from "@/state/favorites";
import styles from "./favorites.module.css";

// D-30 SP-13 #46-6: ヘッダーのお気に入りのボタンと、右から出る一覧のパネル。
// パネルを開くたびに、登録済みの商品IDから名前と価格を取る（lib/productLookup.ts）。「外す」で解除するとハートも同期して未登録になる。
export function FavoritesButton() {
  const [open, setOpen] = useState(false);
  const { ids } = useFavorites();
  const btn = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={btn}
        type="button"
        className="hbtn"
        aria-label="お気に入り"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span aria-hidden="true">♡</span> <span className="t">お気に入り</span>
        {ids.length > 0 && <span className={styles.count}>{ids.length}</span>}
      </button>
      {open && (
        <FavoritesPanel
          onClose={() => {
            setOpen(false);
            btn.current?.focus();
          }}
        />
      )}
    </>
  );
}

function FavoritesPanel({ onClose }: Readonly<{ onClose: () => void }>) {
  const { ids, remove } = useFavorites();
  const [found, setFound] = useState<Record<number, Lookup>>({});
  const closeBtn = useRef<HTMLButtonElement>(null);

  // 開いたときに名前・価格を取る（まだ取っていない商品だけ）
  useEffect(() => {
    let alive = true;
    for (const id of ids) {
      if (found[id]) continue;
      lookupProduct(id).then((r) => alive && setFound((f) => ({ ...f, [id]: r })));
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- found を入れると取得のたびに再実行して重複して取る
  }, [ids]);

  useEffect(() => {
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <aside className={styles.panel} role="dialog" aria-label="お気に入り" onClick={(e) => e.stopPropagation()}>
        <div className={styles.head}>
          <b>お気に入り（{ids.length}件）</b>
          <button ref={closeBtn} type="button" className={styles.close} onClick={onClose}>
            閉じる
          </button>
        </div>
        {ids.length === 0 ? (
          <p className={styles.empty}>まだ登録した商品はありません。</p>
        ) : (
          <ul className={styles.list}>
            {ids.map((id) => {
              const r = found[id];
              return (
                <li key={id}>
                  <span className={styles.nm}>
                    {!r ? "読み込み中…" : r.status === "ok" ? r.product.name : r.status === "notfound" ? "この商品は見つかりません" : "商品の情報を読み込めませんでした"}
                  </span>
                  {r?.status === "ok" && <span>{formatPrice(r.product.price)}</span>}
                  <button type="button" className={styles.unfav} aria-label={r?.status === "ok" ? `${r.product.name}を外す` : "外す"} onClick={() => remove(id)}>
                    外す
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>
    </div>
  );
}
