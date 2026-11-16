"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { arrivesText } from "@/lib/arrival";
import { formatPrice } from "@/lib/formatPrice";
import { productImage } from "@/lib/images";
import { newRecentCache, RECENT_FAILED, RECENT_HEADING } from "@/lib/recent";
import { fetchJson, isProductDetail, productUrl, type ProductDetail } from "@/lib/products";
import { searchHref, type SearchQuery } from "@/lib/searchQuery";
import { recentStore } from "@/state/recent";
import styles from "./recent.module.css";

// R8 SP-22 D-47 S-95: 最近見た商品。検索結果の下（R-02 はページ番号の下、R-01 は 10 件の候補の下）に、新しい順に横に並べる（帯の中だけ横に動く）。
// 保存は商品 ID だけ。表示のとき D-29 を 1 件ずつ並行して呼び、同じ画面の間は取った結果を覚えて取り直さない。
// 取得中は「読み込み中」の枠。404 は出さず、保存からも消す。在庫なしは価格の代わりに「在庫なし」。通信に失敗した商品はその商品だけ出さず（保存は残す）、読めた分だけ出す。
// 全部読めなかったときだけ帯の位置に「最近見た商品を読み込めませんでした」と「もう一度」。0 件・保存できないときは欄ごと出さない。
type Got = { s: "ok"; p: ProductDetail } | { s: "gone" } | { s: "error" };

export function RecentViewed({ q }: Readonly<{ q: SearchQuery }>) {
  const raw = useSyncExternalStore(recentStore.subscribe, recentStore.getSnapshot, recentStore.getServerSnapshot);
  const [cache] = useState(() => newRecentCache<Got>()); // この画面を開いている間だけの覚え（ok と gone だけ。開き直したら空。SP-22）
  const ids = raw ? raw.split(",") : [];
  const [, bump] = useState(0);
  const [errs, setErrs] = useState<ReadonlySet<string>>(new Set());
  const [tries, setTries] = useState(0);

  useEffect(() => {
    const abort = new AbortController();
    for (const id of raw ? raw.split(",") : []) {
      if (cache.has(id)) continue;
      fetchJson(productUrl(id), isProductDetail, abort.signal).then((r) => {
        if (abort.signal.aborted) return;
        if (r.status === "ok") cache.set(id, { s: "ok", p: r.data });
        else if (r.status === "notfound") {
          cache.set(id, { s: "gone" });
          recentStore.remove(id); // 見つからない商品は保存からも消す
        } else setErrs((e) => new Set(e).add(id)); // 失敗は覚えない（保存は残す。次に開いたとき取り直す）
        bump((n) => n + 1);
      });
    }
    return () => abort.abort();
  }, [raw, tries, cache]);

  const gots = ids.map((id) => ({ id, g: cache.get(id) ?? (errs.has(id) ? ({ s: "error" } as Got) : null) }));
  const visible = gots.filter((x) => x.g === null || x.g.s !== "gone");
  if (visible.length === 0) return null;
  const allFailed = visible.every((x) => x.g?.s === "error");

  return (
    <section className={styles.recent} aria-labelledby="h-recent">
      <h2 id="h-recent" className={styles.h}>
        {RECENT_HEADING}
      </h2>
      {allFailed ? (
        <div className={styles.err} role="alert">
          {RECENT_FAILED}
          <button
            type="button"
            className={styles.retry}
            onClick={() => {
              setErrs(new Set());
              setTries(tries + 1);
            }}
          >
            もう一度
          </button>
        </div>
      ) : (
        <ul className={styles.rail}>
          {visible.map(({ id, g }) => {
            if (g === null) {
              return (
                <li key={id} className={styles.item}>
                  <span className={`${styles.card} ${styles.loading}`}>読み込み中</span>
                </li>
              );
            }
            if (g.s !== "ok") return null; // 読めなかった商品だけ出さない
            const p = g.p;
            const img = productImage(p.category);
            const arrives = arrivesText(p.arrives_on);
            return (
              <li key={id} className={styles.item}>
                <Link href={searchHref(q, { product: id })} scroll={false} className={styles.card}>
                  <span className={styles.pic}>
                    {img && <Image src={img} alt="" width={120} height={120} unoptimized />}
                    <span className={styles.imgtag}>イメージ</span>
                  </span>
                  <span className={styles.name}>{p.name}</span>
                  <span className={styles.price}>{p.status === "out_of_stock" ? "在庫なし" : formatPrice(p.price)}</span>
                  {arrives && <span className={styles.meta}>{arrives}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
