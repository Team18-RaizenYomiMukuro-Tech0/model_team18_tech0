"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/formatPrice";
import { productImage } from "@/lib/images";
import { buildSearchHref, fetchRecommended, type RecommendedItem } from "@/lib/topPage";
import styles from "./top.module.css";

// SP-09 D-26 #46-2 #53-1: おすすめの商品。GET /api/products を条件なしで呼んだ先頭4件を4列に並べる。
// 押すと検索結果へ移り、その商品の詳細の欄を開く（詳細の欄は R6）。ハート・カートは後の Issue。
export function Recommended() {
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [items, setItems] = useState<RecommendedItem[]>([]);
  const [tries, setTries] = useState(0); // 「もう一度」で増やして取り直す

  useEffect(() => {
    let alive = true;
    fetchRecommended().then((r) => {
      if (!alive) return;
      if (r.status === "ok") {
        setItems(r.items);
        setState("ok");
      } else setState("error");
    });
    return () => {
      alive = false;
    };
  }, [tries]);

  return (
    <section aria-labelledby="h-rec">
      <h2 id="h-rec" className={styles.h}>
        おすすめの商品
      </h2>
      {state === "error" && (
        <div className={styles.recerr} role="alert">
          おすすめの商品を読み込めませんでした
          <button
            type="button"
            className={styles.btn}
            onClick={() => {
              setState("loading");
              setTries(tries + 1);
            }}
          >
            もう一度
          </button>
        </div>
      )}
      <ul className={styles.rec}>
        {items.map((p) => (
          <li key={p.product_id}>
            <Link className={styles.card} href={buildSearchHref({ productId: p.product_id })}>
              <span className={styles.pic}>
                <Image src={productImage(p.category) ?? ""} alt="" width={200} height={200} unoptimized />
                <span className={styles.imgtag}>イメージ</span>
              </span>
              <span className={styles.name}>{p.name}</span>
              <span className={styles.price}>{formatPrice(p.price)}</span>
              {p.rating != null && p.review_count != null && (
                <span className={styles.rating}>
                  ★ {p.rating}（{p.review_count}件）
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
