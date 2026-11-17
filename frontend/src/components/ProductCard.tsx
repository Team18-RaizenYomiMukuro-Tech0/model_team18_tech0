import Image from "next/image";
import Link from "next/link";
import { formatPrice } from "@/lib/formatPrice";
import { productCandidate } from "@/lib/selection";
import { useAppState } from "@/state/AppState";
import { productImage } from "@/lib/images";
import { ratingText, type Product } from "@/lib/products";
import { CartButton } from "./CardButtons";
import { DecisionChips } from "./DecisionChips";
import { HeartButton } from "./HeartButton";
import { PickControl } from "./PickControl";
import g from "./cardParts.module.css";
import styles from "./results.module.css";

// SP-11 SP-16 F-13 #41-9 OPEN-06: 検索結果のカード。画像（カテゴリー共通イラスト＋「イメージ」）・商品名・価格・評価と件数・
// 決め手の 1 行（DecisionChips。前の「3日でお届け」「ラッピング可」はここにまとめた）・お気に入りのハート・「カートに入れる」（SP-30。下段はハート・カートの順。スマホの幅ではハートは価格の行の右）・高評価バッジ（API の high_rating）。
// 値が無い項目は出さない（値を作らない）。画像と商品名のどちらを押しても詳細の欄（SP-12）を開く。ハートは別のボタン（カード全体を 1 つのリンクにはしない）。
// 一覧は在庫 0 を出さないので、決め手の「在庫あり」はいつも出る。R-02 はシーンを選んでいないので「{シーン}で{n}回」は出ない。
export function ProductCard({ p, href, selected }: Readonly<{ p: Product; href: string; selected: boolean }>) {
  const img = productImage(p.category);
  const { isPicked, pick, unpick } = useAppState();
  return (
    <li className={`${styles.card} ${g.wrap}`} data-selected={selected}>
      <div className={g.grid}>
        <div className={g.picwrap}>
          <Link href={href} scroll={false} className={`${styles.pic} ${g.pic}`} tabIndex={-1} aria-hidden="true">
            {img && <Image src={img} alt="" width={200} height={200} unoptimized />}
            <span className={styles.imgtag}>イメージ</span>
          </Link>
          <span className={g.heart}>
            <HeartButton productId={p.product_id} name={p.name} />
          </span>
        </div>
        {p.high_rating && <span className={`${styles.badge} ${g.badge}`}>高評価の商品</span>}
        <Link href={href} scroll={false} className={`${styles.name} ${g.name}`} aria-current={selected ? "true" : undefined}>
          {p.name}
        </Link>
        <span className={`${styles.price} ${g.price}`}>{formatPrice(p.price)}</span>
        {p.rating != null && p.review_count != null && (
          <span className={`${styles.meta} ${g.meta}`}>
            ★ {ratingText(p.rating)}（{p.review_count}件）
          </span>
        )}
        <div className={g.chips}>
          <DecisionChips arrivesOn={p.arrives_on} wrapping={p.wrapping} inStock />
        </div>
        <div className={g.actions}>
          <PickControl name={p.name} picked={isPicked(p.product_id)} onToggle={() => (isPicked(p.product_id) ? unpick(p.product_id) : pick(productCandidate(p)))} />
          <span className={g.cart}>
            <CartButton productId={p.product_id} name={p.name} />
          </span>
        </div>
      </div>
    </li>
  );
}
