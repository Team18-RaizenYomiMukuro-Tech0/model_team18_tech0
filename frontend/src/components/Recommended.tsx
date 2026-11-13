"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { REQUEST_TIMEOUT_MS, apiUrl } from "@/lib/api";
import { formatPrice } from "@/lib/formatPrice";
import { productImage } from "@/lib/images";
import { buildSearchHref, pickRecommended, type RecommendedItem } from "@/lib/topPage";
import styles from "./top.module.css";

// SP-09 D-26 #46-2 #53-1: おすすめの商品。GET /api/products を条件なしで呼んだ先頭4件を4列に並べる。
// 押すと検索結果へ移り、その商品の詳細の欄を開く（詳細の欄は R6）。ハート・カートは後の Issue。
export function Recommended() {
  const [items, setItems] = useState<RecommendedItem[]>([]);

  useEffect(() => {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);
    fetch(apiUrl("/api/products"), { signal: abort.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad status"))))
      .then((b: { items?: RecommendedItem[] }) => setItems(pickRecommended(Array.isArray(b.items) ? b.items : [])))
      .catch(() => setItems([])) // 失敗時の表示は仕様に書かれていない。見出しだけ出して何も作らない
      .finally(() => clearTimeout(timer));
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, []);

  return (
    <section aria-labelledby="h-rec">
      <h2 id="h-rec" className={styles.h}>
        おすすめの商品
      </h2>
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
