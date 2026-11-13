import { categoryNote } from "@/lib/searchMode";
import { emptyMessageR02 } from "@/lib/products";
import type { SearchQuery } from "@/lib/searchQuery";
import type { SearchState } from "@/lib/api";
import { Searching } from "./Searching";
import styles from "./search.module.css";

// SP-01 D-08 S-38 S-03 S-48 E-02: 検索の状態（初期／検索中／結果あり／0件／失敗）の表示。
// 結果の一覧・カードは F2。ここは見出し「候補（n件）」までで、一覧は載せない。

// 0件の文言は、選んでいる条件で出し分ける。優先はカテゴリー→価格帯→シーン（#55-2、#56-4。emptyMessageR02 と同じ）。
// 結果ありの見出しは「候補（n件）」。カテゴリーを選んでいれば、横に選んだカテゴリーを「・」でつないで全部出す（#58-7）。
export function SearchStatus({
  state,
  q,
  onRetry,
}: Readonly<{ state: SearchState; q: Pick<SearchQuery, "priceBand" | "categories">; onRetry: () => void }>) {
  switch (state.status) {
    case "initial":
      return null;
    case "loading":
      return <Searching />;
    case "results":
      return (
        <h2 className={styles.result}>
          候補（{state.count}件）
          {q.categories.length > 0 && <span className={styles.catnote}>{categoryNote(q.categories)}</span>}
        </h2>
      );
    case "empty":
      return (
        <p className={styles.empty} role="status">
          {emptyMessageR02(q)}
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
