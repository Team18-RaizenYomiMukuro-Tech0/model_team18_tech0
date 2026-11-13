"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { emptyMessageR02, fetchJson, isProductList, productsUrl, type Fetched, type ProductList } from "@/lib/products";
import { parseSearchQuery, searchHref } from "@/lib/searchQuery";
import { DetailPanel } from "./DetailPanel";
import { Pagination } from "./Pagination";
import { ProductCard } from "./ProductCard";
import { Searching } from "./Searching";
import styles from "./results.module.css";

// SP-11 SP-12 D-27 F-13 F-16: 検索結果 `/search` の R-02（シーンなし）の12件ずつ。シーンありの R-01 の10件は R3 で載せる。
// URL のクエリは GET /api/products と同じ名前（#85）。product があれば、その商品の詳細の欄を開く。条件ボタンは R8。
export function SearchResults() {
  const params = useSearchParams();
  const q = useMemo(() => parseSearchQuery(new URLSearchParams(params.toString())), [params]);
  const url = productsUrl(q);
  const [res, setRes] = useState<{ url: string; r: Fetched<ProductList> | null }>({ url: "", r: null });
  const [tries, setTries] = useState(0);

  useEffect(() => {
    const abort = new AbortController();
    fetchJson(url, isProductList, abort.signal).then((r) => {
      if (!abort.signal.aborted) setRes({ url, r });
    });
    return () => abort.abort(); // 続けて操作したら、古い条件の応答は捨てる
  }, [url, tries]);

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
              onClick={() => {
                setRes({ url: "", r: null });
                setTries(tries + 1);
              }}
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
      </section>
      {detailId != null && <DetailPanel productId={detailId} />}
    </div>
  );
}
