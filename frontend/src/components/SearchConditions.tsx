"use client";

import { useRouter } from "next/navigation";
import { SCENES } from "@/lib/api";
import { CATEGORIES } from "@/lib/images";
import { PRICE_BANDS } from "@/lib/priceBand";
import { AUTO_SEARCH_NOTE, CONDITION_HEADINGS, clearConditions, hasConditions, toggleCategory, togglePrice, toggleScene } from "@/lib/searchRequest";
import { searchHref, type SearchQuery } from "@/lib/searchQuery";
import styles from "./conditions.module.css";

// R8 D-27 F-12 #255（見出し） #46-1 #50-2 #54-5 #55-3 #58-5: 検索結果の上段。1行目にシーン・価格帯、2行目にカテゴリー（文字ボタン10個）。
// 押した時点で URL を替えて結果を出し直す（検索ボタンは無い）。同じボタンの再押下で解除。選んだボタンは ✓ と色の両方で示す。
export function SearchConditions({ q }: Readonly<{ q: SearchQuery }>) {
  const router = useRouter();
  const go = (next: SearchQuery) => router.push(searchHref(next));
  const mark = (on: boolean) => (on ? "✓ " : "");
  return (
    <section className={styles.conds} aria-label="検索の条件">
      <div className={styles.row}>
        <div className={styles.fgrp}>
          <b id="cond-scene" className={styles.head}>
            {CONDITION_HEADINGS.scene}
          </b>
          <div className={styles.group} role="group" aria-labelledby="cond-scene">
            {SCENES.map((s) => (
              <button key={s} type="button" className={styles.btn} aria-pressed={q.scene === s} onClick={() => go(toggleScene(q, s))}>
                {mark(q.scene === s)}
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.fgrp}>
          <b id="cond-price" className={styles.head}>
            {CONDITION_HEADINGS.price}
          </b>
          <div className={styles.group} role="group" aria-labelledby="cond-price">
            {PRICE_BANDS.map((b) => (
              <button key={b.value} type="button" className={styles.btn} aria-pressed={q.priceBand === b.value} onClick={() => go(togglePrice(q, b.value))}>
                {mark(q.priceBand === b.value)}
                {b.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className={styles.fgrp}>
        <b id="cond-category" className={styles.head}>
          {CONDITION_HEADINGS.category}
          <span className={styles.hint}>{CONDITION_HEADINGS.categoryHint}</span>
        </b>
        <div className={styles.group} role="group" aria-labelledby="cond-category">
          {CATEGORIES.map((c) => {
            const on = q.categories.includes(c.name);
            return (
              <button key={c.name} type="button" className={styles.btn} aria-pressed={on} onClick={() => go(toggleCategory(q, c.name))}>
                {mark(on)}
                {c.name}
              </button>
            );
          })}
        </div>
      </div>
      <div className={styles.foot}>
        <p className={styles.note}>{AUTO_SEARCH_NOTE}</p>
        <button type="button" className={styles.clear} disabled={!hasConditions(q)} onClick={() => go(clearConditions(q))}>
          条件をクリア
        </button>
      </div>
    </section>
  );
}
