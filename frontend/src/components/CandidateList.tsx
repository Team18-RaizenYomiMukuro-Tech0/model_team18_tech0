"use client";

import { toCandidate } from "@/lib/selection";
import type { CandidateItem } from "@/lib/api";
import { useAppState } from "@/state/AppState";
import { CandidateCard } from "./CandidateCard";
import styles from "./candidates.module.css";

// F2 S-02 S-36: 候補の一覧。応答の 12 件（1 ページ分）を、応答の並びのまま出す。順位の番号（1位・2位…）は出さない（SP-15・PM 決定 3C）。
// hrefFor を渡すと、名前を押して詳細の欄を開ける（検索結果 /search。selectedId は開いている商品）。
export function CandidateList({ items, hrefFor, selectedId, scene = null }: Readonly<{ items: readonly CandidateItem[]; hrefFor?: (productId: string) => string; selectedId?: string | null; scene?: string | null }>) {
  const { isPicked, pick, unpick } = useAppState();
  return (
    <div className={styles.cardsbox}>
    <ul className={styles.cards}>
      {items.map((it) => {
        const picked = isPicked(it.product_id);
        return (
          <CandidateCard key={it.product_id} item={it} picked={picked} onToggle={() => (picked ? unpick(it.product_id) : pick(toCandidate(it, scene)))} href={hrefFor?.(it.product_id)} selected={selectedId === it.product_id} />
        );
      })}
    </ul>
    </div>
  );
}
