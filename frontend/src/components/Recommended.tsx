"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/formatPrice";
import { productImage } from "@/lib/images";
import { ratingText } from "@/lib/products";
import { buildSearchHref, fetchRecommended, type RecommendedItem } from "@/lib/topPage";
import { CartButton } from "./CardButtons";
import { DecisionChips } from "./DecisionChips";
import { HeartButton } from "./HeartButton";
import g from "./cardParts.module.css";
import styles from "./top.module.css";

// SP-09 D-26 #46-2 #53-1: おすすめの商品。GET /api/products を条件なしで呼んだ先頭4件を4列に並べる。
// R6 SP-30 SP-16: カードは検索結果と同じ部品の並び（画像・商品名・価格・評価「4.0（120件）」・決め手の 1 行・ハート・「カートに入れる」）。画像か商品名を押すと検索結果へ移り、その商品の詳細の欄を開く。
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
        {items.map((p) => {
          const href = buildSearchHref({ productId: p.product_id });
          return (
            <li key={p.product_id} className={`${styles.card} ${g.wrap}`}>
              <div className={g.grid}>
                <Link href={href} tabIndex={-1} aria-hidden="true" className={`${styles.pic} ${g.pic}`}>
                  <Image src={productImage(p.category) ?? ""} alt="" width={200} height={200} unoptimized />
                  <span className={styles.imgtag}>イメージ</span>
                </Link>
                <Link href={href} className={`${styles.name} ${g.name}`}>
                  {p.name}
                </Link>
                <span className={`${styles.price} ${g.price}`}>{formatPrice(p.price)}</span>
                {p.rating != null && p.review_count != null && (
                  <span className={`${styles.rating} ${g.meta}`}>
                    ★ {ratingText(p.rating)}（{p.review_count}件）
                  </span>
                )}
                <div className={g.chips}>
                  <DecisionChips arrivesOn={p.arrives_on} wrapping={p.wrapping} inStock />
                </div>
                <span className={g.heart}>
                  <HeartButton productId={p.product_id} name={p.name} />
                </span>
                <span className={g.cart}>
                  <CartButton productId={p.product_id} name={p.name} />
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
