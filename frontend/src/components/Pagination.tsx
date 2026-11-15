import Link from "next/link";
import { pageItems, prevNext, rangeText } from "@/lib/pagination";
import { searchHref, type SearchQuery } from "@/lib/searchQuery";
import styles from "./results.module.css";

// SP-11 SP-32 D-27 U-72 #45-5・6: 短いページ番号（最初・最後・今のページとその前後 2 つ・間は「…」）。 下に「全n件中a〜b件を表示」とページ番号・前へ・次へ。ページ送りは同じ条件のまま替える。
// page は API の応答の page（範囲外のページ番号が来たら1ページ目が返る。#46-5）。
export function Pagination({ q, total, page, pageSize }: Readonly<{ q: SearchQuery; total: number; page: number; pageSize: number }>) {
  const text = rangeText(total, page, pageSize);
  if (!text) return null;
  const items = pageItems(total, page, pageSize);
  const { prev, next } = prevNext(total, page, pageSize);
  const href = (n: number) => searchHref(q, { page: n, product: null });
  return (
    <nav className={styles.pager} aria-label="ページ送り">
      <p className={styles.range}>{text}</p>
      {items.length > 0 && (
        <ul className={styles.pages}>
          <li>
            {prev ? (
              <Link href={href(prev)} className={styles.pg}>
                前へ
              </Link>
            ) : (
              <span className={styles.pg} aria-disabled="true" data-disabled="true">
                前へ
              </span>
            )}
          </li>
          {items.map((n, i) =>
            n === "gap" ? (
              <li key={`gap${i}`} className={styles.gap} aria-hidden="true">
                …
              </li>
            ) : (
              <li key={n}>
                <Link href={href(n)} className={styles.pg} aria-current={n === page ? "page" : undefined}>
                  {n}
                </Link>
              </li>
            ),
          )}
          <li>
            {next ? (
              <Link href={href(next)} className={styles.pg}>
                次へ
              </Link>
            ) : (
              <span className={styles.pg} aria-disabled="true" data-disabled="true">
                次へ
              </span>
            )}
          </li>
        </ul>
      )}
    </nav>
  );
}
