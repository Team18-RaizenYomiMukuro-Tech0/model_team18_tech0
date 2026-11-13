"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/formatPrice";
import { productImage } from "@/lib/images";
import { fetchJson, isProductDetail, productUrl, ratingText, type Fetched, type ProductDetail } from "@/lib/products";
import { HeartButton } from "./HeartButton";
import { Searching } from "./Searching";
import styles from "./results.module.css";

// SP-12 F-14 F-16 D-29 #53-5 #54-6 #55-4 #58-10: 検索結果の右の詳細の欄。
// 商品名・画像・価格（税込）・評価（件数）・「高評価の商品」・配送日数・ラッピング・商品の特徴・セット内容・「カートに入れる」と「お気に入りに追加」。
// 値が無い項目は出さない。在庫0は「在庫なし」。取得が通信の失敗なら「商品の情報を読み込めませんでした」と「もう一度」、404 なら「この商品は見つかりません」だけ。
export function DetailPanel({ productId }: Readonly<{ productId: string }>) {
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

  return (
    <aside className={styles.detail} aria-label="商品の詳細">
      {!r && <Searching />}
      {r?.status === "notfound" && <p role="status">この商品は見つかりません</p>}
      {r?.status === "error" && (
        <div role="alert" className={styles.deterr}>
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
      {r?.status === "ok" && <Body p={r.data} />}
    </aside>
  );
}

function Body({ p }: Readonly<{ p: ProductDetail }>) {
  const img = productImage(p.category);
  return (
    <div className={styles.detbody}>
      <h2 className={styles.detname}>{p.name}</h2>
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
        {/* カートの保存は R9（SP-14）。ここでは置くだけ */}
        <button type="button" className={styles.btn}>
          カートに入れる
        </button>
        <span className={styles.favrow}>
          お気に入りに追加 <HeartButton productId={p.product_id} name={p.name} />
        </span>
      </div>
    </div>
  );
}
