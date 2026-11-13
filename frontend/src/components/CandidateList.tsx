"use client";

import { toCandidate } from "@/lib/selection";
import type { CandidateItem } from "@/lib/api";
import { useAppState } from "@/state/AppState";
import { CandidateCard } from "./CandidateCard";
import styles from "./candidates.module.css";

// F2 S-02 S-36: 候補の一覧。応答の上位10件だけを順位順に並べる（11件目以降は出さない）。
// hrefFor を渡すと、名前を押して詳細の欄を開ける（検索結果 /search。selectedId は開いている商品）。
export function CandidateList({ items, hrefFor, selectedId }: Readonly<{ items: readonly CandidateItem[]; hrefFor?: (productId: string) => string; selectedId?: string | null }>) {
  const { isPicked, pick, unpick } = useAppState();
  return (
    <ul className={styles.cards}>
      {items.slice(0, 10).map((it, i) => {
        const picked = isPicked(it.product_id);
        return (
          <CandidateCard key={it.product_id} item={it} rank={i + 1} picked={picked} onToggle={() => (picked ? unpick(it.product_id) : pick(toCandidate(it)))} href={hrefFor?.(it.product_id)} selected={selectedId === it.product_id} />
        );
      })}
    </ul>
  );
}
