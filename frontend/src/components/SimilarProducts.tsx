"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { arrivesText } from "@/lib/arrival";
import { formatPrice } from "@/lib/formatPrice";
import { productImage } from "@/lib/images";
import { fetchSimilar, type Product } from "@/lib/products";
import { SIMILAR_HEADING } from "@/lib/similar";
import styles from "./similar.module.css";

// R8 SP-25 D-42 S-98: 似た商品。見出し「同じシーン・同じ価格帯の商品」。選んでいるシーンで開いた詳細（R-01）だけ（シーンなし・0 件・失敗は欄ごと出さない）。
// 最大 3 件。各商品は画像・商品名・価格・届く日（目安）で、押すとその商品の詳細に替える。贈った人の声の下に置く。
export function SimilarProducts({ productId, scene, hrefFor }: Readonly<{ productId: string; scene: string | null; hrefFor: (id: string) => string }>) {
  const [res, setRes] = useState<{ key: string; items: Product[] }>({ key: "", items: [] });
  const key = `${productId}|${scene ?? ""}`;
  useEffect(() => {
    if (!scene) return;
    const abort = new AbortController();
    fetchSimilar(productId, scene, abort.signal).then((r) => {
      if (!abort.signal.aborted) setRes({ key, items: r.status === "ok" ? r.data.items.slice(0, 3) : [] });
    });
    return () => abort.abort();
  }, [productId, scene, key]);
  const items = scene && res.key === key ? res.items : [];
  if (items.length === 0) return null;
  return (
    <section className={styles.similar} aria-labelledby="h-similar">
      <h3 id="h-similar" className={styles.h}>
        {SIMILAR_HEADING}
      </h3>
      <ul className={styles.list}>
        {items.map((p) => {
          const img = productImage(p.category);
          const arrives = arrivesText(p.arrives_on);
          return (
            <li key={p.product_id}>
              <Link href={hrefFor(p.product_id)} scroll={false} className={styles.item}>
                <span className={styles.pic}>{img && <Image src={img} alt="" width={64} height={64} unoptimized />}</span>
                <span className={styles.body}>
                  <span className={styles.name}>{p.name}</span>
                  <span className={styles.price}>{formatPrice(p.price)}</span>
                  {arrives && <span className={styles.meta}>{arrives}</span>}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
