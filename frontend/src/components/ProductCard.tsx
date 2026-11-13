import Image from "next/image";
import Link from "next/link";
import { formatPrice } from "@/lib/formatPrice";
import { productImage } from "@/lib/images";
import { ratingText, type Product } from "@/lib/products";
import { HeartButton } from "./HeartButton";
import styles from "./results.module.css";

// SP-11 F-13 #41-9 OPEN-06: 検索結果のカード。画像（カテゴリー共通イラスト＋「イメージ」）・商品名・価格・評価と件数・配送日数・
// ラッピング可・お気に入りのハート・高評価バッジ（API の high_rating。評価 4.5 以上）。評価・件数・配送日数・ラッピングのどれかが
// 無い商品は、その項目だけ出さない（値を作らない）。カードの本体を押すと詳細の欄（SP-12）。
export function ProductCard({ p, href, selected }: Readonly<{ p: Product; href: string; selected: boolean }>) {
  const img = productImage(p.category);
  return (
    <li className={styles.card} data-selected={selected}>
      <Link href={href} scroll={false} className={styles.body} aria-current={selected ? "true" : undefined}>
        <span className={styles.pic}>
          {img && <Image src={img} alt="" width={200} height={200} unoptimized />}
          <span className={styles.imgtag}>イメージ</span>
        </span>
        {p.high_rating && <span className={styles.badge}>高評価の商品</span>}
        <span className={styles.name}>{p.name}</span>
        <span className={styles.price}>{formatPrice(p.price)}</span>
        {p.rating != null && p.review_count != null && (
          <span className={styles.meta}>
            ★ {ratingText(p.rating)}（{p.review_count}件）
          </span>
        )}
        {p.delivery_days != null && <span className={styles.meta}>{p.delivery_days}日でお届け</span>}
        {p.wrapping === true && <span className={styles.meta}>ラッピング可</span>}
      </Link>
      <span className={styles.heartpos}>
        <HeartButton productId={p.product_id} name={p.name} />
      </span>
    </li>
  );
}
