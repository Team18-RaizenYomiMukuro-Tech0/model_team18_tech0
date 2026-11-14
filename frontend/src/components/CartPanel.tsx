"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { formatPrice } from "@/lib/formatPrice";
import { fetchJson, isProductDetail, productUrl, type ProductDetail } from "@/lib/products";
import { canDecrease, canIncrease, cartStore, cartTotal, normalizeQty, ORDER_DEMO_MESSAGE, stepQty, useCart } from "@/state/cart";
import { CartChecker, type CartFound } from "@/state/cartCheck";
import { ADDED_MESSAGE, CORRUPT_MESSAGE, cartNotice } from "@/state/cartNotice";
import fav from "./favorites.module.css";
import styles from "./cart.module.css";

// D-31 SP-14 F-17 #46-6 #50-4 #53-5: ヘッダーのカートのボタンと、右から出る一覧のパネル。
// 開くたびに、保存した商品IDごとに GET /api/products/{id}（D-29）で確かめる。404 は「販売終了」、out_of_stock は「在庫なし」。
// どちらも合計に入れない。数量は直接入力でき、欄を離れた時点（blur）で 1〜99 に直す。
export function CartButton() {
  const [open, setOpen] = useState(false);
  const { count } = useCart();
  const btn = useRef<HTMLButtonElement>(null);
  // 保存が壊れていて空にしたときの知らせを、開いたときに1回だけ出す（SP-14 ④）
  useEffect(() => {
    if (cartStore.takeCorruptNotice()) cartNotice.show("corrupt");
  }, []);
  return (
    <>
      <button ref={btn} type="button" className="hbtn" aria-label="カート" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span aria-hidden="true">🛒</span> <span className="t">カート</span>
        {count > 0 && <span className={fav.count}>{count}</span>}
      </button>
      <CartToast onView={() => setOpen(true)} />
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

// 「カートに入れました」「カートを読み込めなかったため、空にしました」の通知（SP-14 ③④）。読み上げ対象（role="status"）。
// マウスやフォーカスが通知にある間は消さない。パネルは自動では開かず、「カートを見る」で開く
function CartToast({ onView }: Readonly<{ onView: () => void }>) {
  const n = useSyncExternalStore(cartNotice.subscribe, cartNotice.getSnapshot, () => null);
  return (
    <div role="status" className={styles.toastBox}>
      {n && (
        <div
          key={n.seq}
          className={styles.toast}
          onMouseEnter={() => cartNotice.hold()}
          onMouseLeave={() => cartNotice.release()}
          onFocus={() => cartNotice.hold()}
          onBlur={() => cartNotice.release()}
        >
          <span>{n.kind === "added" ? ADDED_MESSAGE : CORRUPT_MESSAGE}</span>
          {n.kind === "added" && (
            <button
              type="button"
              className={styles.toastLink}
              onClick={() => {
                cartNotice.dismiss();
                onView();
              }}
            >
              カートを見る
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function toInfo(r: Awaited<ReturnType<typeof fetchJson<ProductDetail>>>): CartFound {
  if (r.status === "ok") return { status: "ok", price: r.data.price, stock: r.data.status, name: r.data.name };
  return r.status === "notfound" ? { status: "notfound" } : { status: "error" };
}

function CartPanel({ onClose }: Readonly<{ onClose: () => void }>) {
  const { cart, ids, setQty, remove } = useCart();
  const [found, setFound] = useState<Readonly<Record<string, CartFound>>>({});
  const [msg, setMsg] = useState("");
  const closeBtn = useRef<HTMLButtonElement>(null);
  const checker = useRef<CartChecker | null>(null);

  // 開いたときに確かめる（まだ確かめていない商品だけ）。閉じたら応答を捨てる。
  // 開発時の二重実行（開く→閉じる→開く）でも壊れないよう、確認の部品は effect の中で作る
  useEffect(() => {
    const c = new CartChecker((id, signal) => fetchJson(productUrl(id), isProductDetail, signal).then(toInfo), setFound);
    checker.current = c;
    c.check(ids);
    return () => {
      c.dispose();
      checker.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- 開いたときの1回だけ
  // 商品が増えたら増えた分だけ確かめる
  useEffect(() => {
    checker.current?.check(ids);
  }, [ids.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps -- ids の中身が変わったときだけ

  // 「閉じる」へフォーカスを置くのは、開いたときの1回だけ（数量の入力・削除のあとに動かさない。D-31、N-12）
  useEffect(() => {
    closeBtn.current?.focus();
  }, []);
  useEffect(() => {
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
                <CartRow key={id} id={id} qty={cart[id]} info={found[id]} onQty={(q) => setQty(id, q)} onRemove={() => remove(id)} onRetry={() => checker.current?.retry(id)} />
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

function CartRow({ id, qty, info, onQty, onRemove, onRetry }: Readonly<{ id: string; qty: number; info?: CartFound; onQty: (q: number) => void; onRemove: () => void; onRetry: () => void }>) {
  const [draft, setDraft] = useState<string | null>(null); // 入力中の文字。欄を離れたら確定して null に戻す
  const input = useRef<HTMLInputElement>(null);
  const name = !info ? "読み込み中…" : info.status === "ok" ? (info.name ?? id) : info.status === "notfound" ? "この商品は見つかりません" : "商品の情報を読み込めませんでした";
  const unavailable = info?.status === "notfound" ? "販売終了" : info?.status === "ok" && info.stock === "out_of_stock" ? "在庫なし" : null;
  // ＋／−（SP-14 ①）。押せなくなったボタンにフォーカスが残らないよう、境界に着いたら数量の欄へ移す（キーボードだけでも続けられる。N-12）
  const step = (delta: 1 | -1) => {
    const next = stepQty(qty, delta);
    setDraft(null);
    onQty(next);
    if (!canDecrease(next) || !canIncrease(next)) input.current?.focus();
  };
  return (
    <li className={styles.row}>
      <span className={fav.nm}>{name}</span>
      {info?.status === "error" && (
        <button
          type="button"
          className={styles.retry}
          onClick={() => {
            input.current?.focus(); // 押したボタンは読み込み中に消えるので、フォーカスを行の中に残す
            onRetry();
          }}
        >
          もう一度読み込む
        </button>
      )}
      {unavailable && <span className={styles.unavail}>{unavailable}（合計に入りません）</span>}
      {info?.status === "ok" && <span>{formatPrice(info.price)}</span>}
      <span className={styles.qty}>
        <button type="button" className={styles.step} aria-label={`${name}の数量を1減らす`} disabled={!canDecrease(qty)} onClick={() => step(-1)}>
          −
        </button>
        <label>
          数量
          <input
            ref={input}
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
        <button type="button" className={styles.step} aria-label={`${name}の数量を1増やす`} disabled={!canIncrease(qty)} onClick={() => step(1)}>
          ＋
        </button>
      </span>
      <button type="button" className={fav.unfav} aria-label={`${name}を削除`} onClick={onRemove}>
        削除
      </button>
    </li>
  );
}
