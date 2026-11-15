"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { formatPrice } from "@/lib/formatPrice";
import { SHEET_MAX_WIDTH } from "@/lib/mobileLayout";
import { productImage } from "@/lib/images";
import { fetchJson, isProductDetail, productUrl, ratingText, type Fetched, type ProductDetail } from "@/lib/products";
import { cartStore } from "@/state/cart";
import { HeartButton } from "./HeartButton";
import { Searching } from "./Searching";
import { Sheet } from "./Sheet";
import { useMediaQuery } from "./useMediaQuery";
import styles from "./results.module.css";

// SP-12 F-14 F-16 D-29 #53-5 #54-6 #55-4 #58-10: 検索結果の右の詳細の欄。
// 商品名・画像・価格（税込）・評価（件数）・「高評価の商品」・配送日数・ラッピング・商品の特徴・セット内容・「カートに入れる」と「お気に入りに追加」。
// 値が無い項目は出さない。在庫0は「在庫なし」。取得が通信の失敗なら「商品の情報を読み込めませんでした」と「もう一度」、404 なら「この商品は見つかりません」だけ。
// R2 SP-29 D-46: 899px 以下は下から出るシート（閉じるボタン・Esc。開いたら商品名へ焦点）、900px 以上は右の欄。
// どちらも一番下に「{価格}（税込）［カートに入れる］」の帯を固定する（`position: sticky; bottom: 0`。在庫 0 は「在庫なし」で押せない）。
export function DetailPanel({ productId, onClose, focusKey = null }: Readonly<{ productId: string; onClose: () => void; focusKey?: number | null }>) {
  const sheet = useMediaQuery(`(max-width: ${SHEET_MAX_WIDTH}px)`);
  const [state, setState] = useState<{ id: string; r: Fetched<ProductDetail> | null }>({ id: productId, r: null });
  const [tries, setTries] = useState(0);

  useEffect(() => {
    const abort = new AbortController();
    fetchJson(productUrl(productId), isProductDetail, abort.signal).then((r) => {
      if (!abort.signal.aborted) setState({ id: productId, r });
    });
    return () => abort.abort();
  }, [productId, tries]);

  // 別のカードを押した直後は、前の商品の中身を出さない
  const r = state.id === productId ? state.r : null;

  const content = (
    <>
      {!r && (
        <div className={styles.detpad}>
          <Searching />
        </div>
      )}
      {r?.status === "notfound" && (
        <p role="status" className={styles.detpad}>
          この商品は見つかりません
        </p>
      )}
      {r?.status === "error" && (
        <div role="alert" className={`${styles.deterr} ${styles.detpad}`}>
          商品の情報を読み込めませんでした
          <button
            type="button"
            className={styles.btn}
            onClick={() => {
              setState({ id: productId, r: null });
              setTries(tries + 1);
            }}
          >
            もう一度
          </button>
        </div>
      )}
      {r?.status === "ok" && <Body p={r.data} focusName={sheet} focusKey={focusKey} />}
      {r?.status === "ok" && <Foot p={r.data} />}
    </>
  );
  if (sheet) {
    return (
      <Sheet label="商品の詳細" onClose={onClose}>
        {content}
      </Sheet>
    );
  }
  return (
    <aside className={styles.detail} aria-label="商品の詳細">
      {content}
    </aside>
  );
}

// 一番下の固定の帯: {価格}（税込）［カートに入れる］。在庫 0 は「在庫なし」で押せない（SP-18）。押すと giftia:cart に追加（同じ商品は数量+1。D-31）
function Foot({ p }: Readonly<{ p: ProductDetail }>) {
  const out = p.status === "out_of_stock";
  return (
    <div className={styles.detfoot}>
      <span className={styles.footprice}>{formatPrice(p.price)}</span>
      {out ? (
        <button type="button" className={styles.footbtn} disabled>
          在庫なし
        </button>
      ) : (
        <button type="button" className={styles.footbtn} data-primary="true" onClick={() => cartStore.add(p.product_id)}>
          カートに入れる
        </button>
      )}
    </div>
  );
}

function Body({ p, focusName, focusKey }: Readonly<{ p: ProductDetail; focusName: boolean; focusKey: number | null }>) {
  const img = productImage(p.category);
  const name = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusName || focusKey != null) name.current?.focus(); // シートが開いたら・PC でキーボードのカードを押したら、読めた商品名へ焦点（D-46）
  }, [focusName, focusKey, p.product_id]);
  return (
    <div className={`${styles.detbody} ${styles.detpad}`}>
      <h2 className={styles.detname} ref={name} tabIndex={-1}>
        {p.name}
      </h2>
      <span className={styles.pic}>
        {img && <Image src={img} alt="" width={240} height={240} unoptimized />}
        <span className={styles.imgtag}>イメージ</span>
      </span>
      {p.high_rating && <span className={styles.badge}>高評価の商品</span>}
      {p.status === "out_of_stock" && <span className={styles.stockout}>在庫なし</span>}
      <span className={styles.price}>{formatPrice(p.price)}</span>
      {p.rating != null && p.review_count != null && (
        <span className={styles.meta}>
          ★ {ratingText(p.rating)}（{p.review_count}件）
        </span>
      )}
      {p.delivery_days != null && <span className={styles.meta}>{p.delivery_days}日でお届け</span>}
      {p.wrapping === true && <span className={styles.meta}>ラッピング可</span>}
      {p.description && (
        <p className={styles.dt}>
          <b>商品の特徴</b>
          <br />
          {p.description}
        </p>
      )}
      {p.size && (
        <p className={styles.dt}>
          <b>セット内容</b>
          <br />
          {p.size}
        </p>
      )}
      <div className={styles.actions}>
        <span className={styles.favrow}>
          お気に入りに追加 <HeartButton productId={p.product_id} name={p.name} />
        </span>
      </div>
    </div>
  );
}
