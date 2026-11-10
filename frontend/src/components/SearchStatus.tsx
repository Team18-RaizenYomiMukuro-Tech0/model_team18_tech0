import type { PriceBand } from "@/lib/priceBand";
import type { SearchState } from "@/lib/api";
import { Searching } from "./Searching";
import styles from "./search.module.css";

// SP-01 D-08 S-38 S-03 S-48 E-02: 検索の状態（初期／検索中／結果あり／0件／失敗）の表示。
// 結果の一覧・カードは F2。ここは見出し「候補（n件）」までで、一覧は載せない。

// 0件の文言は、選んでいる条件で出し分ける（価格帯あり→価格帯、なし→シーン。#49-4。カテゴリーは R3 以降）
export function emptyMessage(priceBand: PriceBand | null): string {
  return priceBand
    ? "条件に合う商品がありません。価格帯を変えてみてください"
    : "この条件に合う商品がありません。シーンを変えてみてください";
}

export function SearchStatus({
  state,
  priceBand,
  onRetry,
}: Readonly<{ state: SearchState; priceBand: PriceBand | null; onRetry: () => void }>) {
  switch (state.status) {
    case "initial":
      return null;
    case "loading":
      return <Searching />;
    case "results":
      return <h2 className={styles.result}>候補（{state.count}件）</h2>;
    case "empty":
      return (
        <p className={styles.empty} role="status">
          {emptyMessage(priceBand)}
        </p>
      );
    case "error":
      return (
        <div className={styles.error} role="alert">
          失敗しました。もう一度お試しください
          <button type="button" className={styles.retry} onClick={onRetry}>
            再試行
          </button>
        </div>
      );
  }
}
