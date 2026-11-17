import Image from "next/image";
import Link from "next/link";
import { formatPrice } from "@/lib/formatPrice";
import { productImage } from "@/lib/images";
import type { CandidateItem } from "@/lib/api";
import { CartButton } from "./CardButtons";
import { DecisionChips } from "./DecisionChips";
import { HeartButton } from "./HeartButton";
import { PickControl } from "./PickControl";
import g from "./cardParts.module.css";
import styles from "./candidates.module.css";

// F2 SP-01 D-08 S-02 S-36 #41-6: 候補のカード。順位・画像（カテゴリー共通イラスト＋「イメージ」）・商品名・価格・理由の文・
// 決め手の 1 行（SP-16）・高評価バッジ（high_rating が true のとき）。画像と商品名のどちらを押しても詳細を開く（SP-11）。
// SP-30: 下段は「共有リストに入れる」・ハート・「カートに入れる」の順（カートの上の行が共有リスト）。ボタンは「共有リストに入れる」、押した後は「✓ リストに入れた」（SP-04。もう一度押すと外れる）。決め手の「{シーン}で{n}回」は R-01 だけ（scene_count が来る）。
export function CandidateCard({
  item,
  rank,
  picked,
  onToggle,
  href,
  selected = false,
}: Readonly<{ item: CandidateItem; rank: number; picked: boolean; onToggle: () => void; href?: string; selected?: boolean }>) {
  const img = productImage(item.category);
  return (
    <li className={`${styles.card} ${g.wrap}`} data-picked={picked} data-selected={selected}>
      <div className={g.grid}>
        <span className={`${styles.rank} ${g.rank}`} aria-label={`${rank}位`}>
          {rank}位
        </span>
        <div className={g.picwrap}>
          {href ? (
            <Link href={href} scroll={false} className={`${styles.pic} ${g.pic}`} tabIndex={-1} aria-hidden="true">
              {img && <Image src={img} alt="" width={200} height={200} unoptimized />}
              <span className={styles.imgtag}>イメージ</span>
            </Link>
          ) : (
            <span className={`${styles.pic} ${g.pic}`}>
              {img && <Image src={img} alt="" width={200} height={200} unoptimized />}
              <span className={styles.imgtag}>イメージ</span>
            </span>
          )}
          <span className={g.heart}>
            <HeartButton productId={item.product_id} name={item.name} />
          </span>
        </div>
        {item.high_rating && <span className={`${styles.badge} ${g.badge}`}>高評価の商品</span>}
        {href ? (
          <Link href={href} scroll={false} className={`${styles.name} ${g.name}`} aria-current={selected ? "true" : undefined}>
            {item.name}
          </Link>
        ) : (
          <span className={`${styles.name} ${g.name}`}>{item.name}</span>
        )}
        <span className={`${styles.price} ${g.price}`}>{formatPrice(item.price)}</span>
        <div className={g.chips}>
          <DecisionChips arrivesOn={item.arrives_on} wrapping={item.wrapping} inStock sceneCount={item.scene_count} />
        </div>
        <span className={`${styles.reason} ${g.reason}`}>{item.reason}</span>
        <div className={g.actions}>
          <PickControl name={item.name} picked={picked} onToggle={onToggle} />
          <span className={g.cart}>
            <CartButton productId={item.product_id} name={item.name} />
          </span>
        </div>
      </div>
    </li>
  );
}
