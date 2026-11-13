"use client";

import { useEffect, useRef, useState } from "react";
import { formatPrice } from "@/lib/formatPrice";
import { fetchJson, isProductDetail, productUrl, type ProductDetail } from "@/lib/products";
import { cartTotal, normalizeQty, ORDER_DEMO_MESSAGE, useCart, type CartInfo } from "@/state/cart";
import fav from "./favorites.module.css";
import styles from "./cart.module.css";

// D-31 SP-14 F-17 #46-6 #50-4 #53-5: ヘッダーのカートのボタンと、右から出る一覧のパネル。
// 開くたびに、保存した商品IDごとに GET /api/products/{id}（D-29）で確かめる。404 は「販売終了」、out_of_stock は「在庫なし」。
// どちらも合計に入れない。数量は直接入力でき、欄を離れた時点（blur）で 1〜99 に直す。
export function CartButton() {
  const [open, setOpen] = useState(false);
  const { count } = useCart();
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={btn} type="button" className="hbtn" aria-label="カート" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span aria-hidden="true">🛒</span> <span className="t">カート</span>
        {count > 0 && <span className={fav.count}>{count}</span>}
      </button>
      {open && (
        <CartPanel
          onClose={() => {
            setOpen(false);
            btn.current?.focus();
          }}
        />
      )}
    </>
  );
}

function toInfo(r: Awaited<ReturnType<typeof fetchJson<ProductDetail>>>): CartInfo & { name?: string } {
  if (r.status === "ok") return { status: "ok", price: r.data.price, stock: r.data.status, name: r.data.name };
  return r.status === "notfound" ? { status: "notfound" } : { status: "error" };
}

function CartPanel({ onClose }: Readonly<{ onClose: () => void }>) {
  const { cart, ids, setQty, remove } = useCart();
  const [found, setFound] = useState<Record<string, CartInfo & { name?: string }>>({});
  const [msg, setMsg] = useState("");
  const closeBtn = useRef<HTMLButtonElement>(null);

  // 開いたときに確かめる（まだ確かめていない商品だけ）
  useEffect(() => {
    const abort = new AbortController();
    for (const id of ids) {
      if (found[id]) continue;
      fetchJson(productUrl(id), isProductDetail, abort.signal).then((r) => {
        if (!abort.signal.aborted) setFound((f) => ({ ...f, [id]: toInfo(r) }));
      });
    }
    return () => abort.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- found を入れると取得のたびに再実行して重複して取る
  }, [ids.join("|")]);

  useEffect(() => {
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const total = cartTotal(cart, found);
  return (
    <div className={fav.overlay} onClick={onClose}>
      <aside className={fav.panel} role="dialog" aria-label="カート" onClick={(e) => e.stopPropagation()}>
        <div className={fav.head}>
          <b>カート（{ids.length}件）</b>
          <button ref={closeBtn} type="button" className={fav.close} onClick={onClose}>
            閉じる
          </button>
        </div>
        {ids.length === 0 ? (
          <p className={fav.empty}>カートに入っている商品はありません。</p>
        ) : (
          <>
            <ul className={fav.list}>
              {ids.map((id) => (
                <CartRow key={id} id={id} qty={cart[id]} info={found[id]} onQty={(q) => setQty(id, q)} onRemove={() => remove(id)} />
              ))}
            </ul>
            <p className={styles.total}>
              合計 <b>{formatPrice(total)}</b>
            </p>
            <button type="button" className={styles.order} onClick={() => setMsg(ORDER_DEMO_MESSAGE)}>
              注文へ進む
            </button>
            <p role="status" className={styles.msg}>
              {msg}
            </p>
          </>
        )}
      </aside>
    </div>
  );
}

function CartRow({ id, qty, info, onQty, onRemove }: Readonly<{ id: string; qty: number; info?: CartInfo & { name?: string }; onQty: (q: number) => void; onRemove: () => void }>) {
  const [draft, setDraft] = useState<string | null>(null); // 入力中の文字。欄を離れたら確定して null に戻す
  const name = !info ? "読み込み中…" : info.status === "ok" ? (info.name ?? id) : info.status === "notfound" ? "この商品は見つかりません" : "商品の情報を読み込めませんでした";
  const unavailable = info?.status === "notfound" ? "販売終了" : info?.status === "ok" && info.stock === "out_of_stock" ? "在庫なし" : null;
  return (
    <li className={styles.row}>
      <span className={fav.nm}>{name}</span>
      {unavailable && <span className={styles.unavail}>{unavailable}（合計に入りません）</span>}
      {info?.status === "ok" && <span>{formatPrice(info.price)}</span>}
      <label className={styles.qty}>
        数量
        <input
          type="text"
          inputMode="numeric"
          value={draft ?? String(qty)}
          aria-label={`${name}の数量`}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft !== null) onQty(normalizeQty(draft, qty));
            setDraft(null);
          }}
        />
      </label>
      <button type="button" className={fav.unfav} aria-label={`${name}を削除`} onClick={onRemove}>
        削除
      </button>
    </li>
  );
}
