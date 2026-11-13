import Link from "next/link";
import { pageNumbers, prevNext, rangeText } from "@/lib/pagination";
import { searchHref, type SearchQuery } from "@/lib/searchQuery";
import styles from "./results.module.css";

// SP-11 D-27 U-48 #45-5・6: 下に「全n件中a〜b件を表示」とページ番号・前へ・次へ。ページ送りは同じ条件のまま替える。
// page は API の応答の page（範囲外のページ番号が来たら1ページ目が返る。#46-5）。
export function Pagination({ q, total, page, pageSize }: Readonly<{ q: SearchQuery; total: number; page: number; pageSize: number }>) {
  const text = rangeText(total, page, pageSize);
  if (!text) return null;
  const nums = pageNumbers(total, pageSize);
  const { prev, next } = prevNext(total, page, pageSize);
  const href = (n: number) => searchHref(q, { page: n, product: null });
  return (
    <nav className={styles.pager} aria-label="ページ送り">
      <p className={styles.range}>{text}</p>
      {nums.length > 0 && (
        <ul className={styles.pages}>
          {prev && (
            <li>
              <Link href={href(prev)} className={styles.pg}>
                前へ
              </Link>
            </li>
          )}
          {nums.map((n) => (
            <li key={n}>
              <Link href={href(n)} className={styles.pg} aria-current={n === page ? "page" : undefined}>
                {n}
              </Link>
            </li>
          ))}
          {next && (
            <li>
              <Link href={href(next)} className={styles.pg}>
                次へ
              </Link>
            </li>
          )}
        </ul>
      )}
    </nav>
  );
}
