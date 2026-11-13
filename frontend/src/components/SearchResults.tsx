"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { emptyMessageR02, type Fetched, type ProductList } from "@/lib/products";
import { ProductRunner } from "@/lib/searchRequest";
import { searchMode } from "@/lib/searchMode";
import { parseSearchQuery, searchHref, type SearchQuery } from "@/lib/searchQuery";
import { CandidateResults } from "./CandidateResults";
import { DetailPanel } from "./DetailPanel";
import { Pagination } from "./Pagination";
import { ProductCard } from "./ProductCard";
import { SearchConditions } from "./SearchConditions";
import { Searching } from "./Searching";
import { SelectedList } from "./SelectedList";
import styles from "./results.module.css";

// SP-11 SP-12 D-27 F-13 F-16 F-19: 検索結果 `/search`。シーンがあれば R-01 の10件（CandidateResults。GET /api/candidates）、
// 無ければ R-02 の12件ずつ（GET /api/products）。どちらを呼ぶかは searchMode（#51-2）。
// URL のクエリは GET /api/products と同じ名前（#85）。product があれば、その商品の詳細の欄を開く。条件ボタンは SearchConditions（R8）。
export function SearchResults() {
  const params = useSearchParams();
  const q = useMemo(() => parseSearchQuery(new URLSearchParams(params.toString())), [params]);
  return (
    <>
      <SearchConditions q={q} />
      {q.scene ? <CandidateResults q={q} /> : <ProductResults q={q} />}
    </>
  );
}

function ProductResults({ q }: Readonly<{ q: SearchQuery }>) {
  const { url } = searchMode(q);
  const [res, setRes] = useState<{ url: string; r: Fetched<ProductList> | null }>({ url: "", r: null });
  const runner = useRef<ProductRunner | null>(null);

  useEffect(() => {
    const r = new ProductRunner((u, v) => setRes({ url: u, r: v }));
    runner.current = r;
    return () => r.cancel();
  }, []);
  useEffect(() => {
    runner.current?.run(url); // 続けて条件を変えたら、古い条件の応答は捨てる・10秒で打ち切る（ProductRunner）
  }, [url]);

  const r = res.url === url ? res.r : null;
  const detailId = q.product;

  return (
    <div className={styles.layout}>
      <section aria-label="検索結果" className={styles.results}>
        {!r && <Searching />}
        {r?.status === "error" && (
          <div role="alert" className={styles.deterr}>
            失敗しました。もう一度お試しください
            <button
              type="button"
              className={styles.btn}
              onClick={() => runner.current?.run(url)}
            >
              再試行
            </button>
          </div>
        )}
        {r?.status === "notfound" && <p role="status">{emptyMessageR02(q)}</p>}
        {r?.status === "ok" && r.data.items.length === 0 && (
          <p className={styles.empty} role="status">
            {emptyMessageR02(q)}
          </p>
        )}
        {r?.status === "ok" && r.data.items.length > 0 && (
          <>
            <ul className={styles.cards}>
              {r.data.items.map((p) => (
                <ProductCard key={p.product_id} p={p} href={searchHref(q, { page: r.data.page, product: p.product_id })} selected={p.product_id === detailId} />
              ))}
            </ul>
            <Pagination q={q} total={r.data.total} page={r.data.page} pageSize={r.data.page_size} />
          </>
        )}
        <SelectedList />
      </section>
      {detailId != null && <DetailPanel productId={detailId} />}
    </div>
  );
}
