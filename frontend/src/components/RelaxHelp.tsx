import Link from "next/link";
import type { Relax } from "@/lib/api";
import { relaxRows } from "@/lib/relaxHelp";
import { searchHref, type SearchQuery } from "@/lib/searchQuery";
import styles from "./conditions.module.css";

// R7 SP-24 D-44 D-46: 0 件の文言の下の助け舟。押すとその条件をはずして出し直す（URL も変わる）。件数が取れなかったときは何も出さない。
export function RelaxHelp({ q, relax }: Readonly<{ q: SearchQuery; relax: Relax | null | undefined }>) {
  const rows = relaxRows(q, relax);
  if (rows.length === 0) return null;
  return (
    <div className={styles.help}>
      {rows.map((r) => (
        <Link key={r.key} href={searchHref(r.next)} className={styles.helpbtn}>
          {r.text}
        </Link>
      ))}
    </div>
  );
}
