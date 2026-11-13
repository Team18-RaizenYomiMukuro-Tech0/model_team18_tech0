import Image from "next/image";
import Link from "next/link";
import { formatPrice } from "@/lib/formatPrice";
import { productImage } from "@/lib/images";
import type { CandidateItem } from "@/lib/api";
import styles from "./candidates.module.css";

// F2 SP-01 D-08 S-02 S-36 #41-6: 候補のカード。順位・画像（カテゴリー共通イラスト＋「イメージ」）・商品名・価格・理由の文・
// 高評価バッジ（high_rating が true のとき）。載せるのはこの6つだけ。選んでいる商品には「選択中」と出し、もう一度押すと外れる。
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
    <li className={styles.card} data-picked={picked} data-selected={selected}>
      <span className={styles.rank} aria-label={`${rank}位`}>
        {rank}位
      </span>
      <span className={styles.pic}>
        {img && <Image src={img} alt="" width={200} height={200} unoptimized />}
        <span className={styles.imgtag}>イメージ</span>
      </span>
      {item.high_rating && <span className={styles.badge}>高評価の商品</span>}
      {href ? (
        <Link href={href} scroll={false} className={styles.name} aria-current={selected ? "true" : undefined}>
          {item.name}
        </Link>
      ) : (
        <span className={styles.name}>{item.name}</span>
      )}
      <span className={styles.price}>{formatPrice(item.price)}</span>
      <span className={styles.reason}>{item.reason}</span>
      <button type="button" className={styles.pick} aria-pressed={picked} onClick={onToggle}>
        {picked ? "✓ 選択中" : "選ぶ"}
        <span className={styles.vh}>（{item.name}）</span>
      </button>
    </li>
  );
}
