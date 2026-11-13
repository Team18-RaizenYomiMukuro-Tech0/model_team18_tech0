"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SCENES, type Scene } from "@/lib/api";
import { PRICE_BANDS, togglePriceBand, type PriceBand } from "@/lib/priceBand";
import { bandLinkHref, buildSearchHref } from "@/lib/topPage";
import styles from "./top.module.css";

// SP-09 D-26 #50-1 #51-1 #53-3 #54-8 #55-5: シーン3タイルと価格帯3ボタンを1組で並べる（「候補を出す」ボタンは置かない）。
// シーンのタイルを押した時点で検索結果へ移る（価格帯を選んでいればその価格帯つき）。
// 価格帯だけを押したときは選ぶだけで移らない。そのとき（シーン未選択・価格帯あり）だけ「この価格帯の商品を見る」を出す。
export function TopSearch() {
  const router = useRouter();
  const [band, setBand] = useState<PriceBand | null>(null);
  // トップではシーンのタイルを押すと移るので、トップにいるあいだシーンは未選択のまま
  const scene: Scene | null = null;
  const link = bandLinkHref(scene, band);

  return (
    <div className={styles.set}>
      <section aria-labelledby="h-scene">
        <h2 id="h-scene" className={styles.h}>
          シーンから探す
        </h2>
        <div className={styles.tiles} role="group" aria-label="シーン">
          {SCENES.map((s) => (
            <button key={s} type="button" className={styles.tile} onClick={() => router.push(buildSearchHref({ scene: s, priceBand: band }))}>
              {s}
            </button>
          ))}
        </div>
      </section>
      <section aria-labelledby="h-band">
        <h2 id="h-band" className={styles.h}>
          予算から探す
        </h2>
        <div className={styles.row} role="group" aria-label="価格帯（税込）">
          {PRICE_BANDS.map((b) => (
            <button
              key={b.value}
              type="button"
              className={styles.btn}
              aria-pressed={band === b.value}
              onClick={() => setBand(togglePriceBand(band, b.value))}
            >
              {band === b.value ? "✓ " : ""}
              {b.label}
            </button>
          ))}
        </div>
        {link && (
          <p className={styles.bandlink}>
            <Link href={link}>この価格帯の商品を見る</Link>
          </p>
        )}
      </section>
    </div>
  );
}
