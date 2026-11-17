"use client";

import { useRouter } from "next/navigation";
import { setSort } from "@/lib/searchRequest";
import { sortOptions, searchHref, type SearchQuery, type SortKey } from "@/lib/searchQuery";
import styles from "./conditions.module.css";

// R7 SP-21 D-43: シーンなしの結果の見出しの右に置く並び替え（おすすめ・安い順・評価順・早く届く順）。選んだ並びは URL の sort に持つ
// （「おすすめ」のときは付かない。searchHref）。変えたら同じ条件のまま 1 ページ目に戻る（setSort）。R-01（シーンあり・言葉なし）には「{シーン}で選ばれた回数順」も出る。
export function SortSelect({ q }: Readonly<{ q: SearchQuery }>) {
  const router = useRouter();
  return (
    <label className={styles.sortbar}>
      並び
      <select className={styles.sortsel} value={q.sort} onChange={(e) => router.push(searchHref(setSort(q, e.target.value as SortKey)))}>
        {sortOptions(q.q ? null : q.scene).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
