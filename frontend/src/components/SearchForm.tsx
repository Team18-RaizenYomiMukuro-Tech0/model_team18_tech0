"use client";

import { useEffect, useRef, useState } from "react";
import { SCENES, SearchRunner, type Scene, type SearchState } from "@/lib/api";
import { PRICE_BANDS, togglePriceBand, type PriceBand } from "@/lib/priceBand";
import { SearchStatus } from "./SearchStatus";
import styles from "./search.module.css";

// SP-01 D-08 F-01 #50-1 #51-1: 検索ページの入力。価格帯（任意）とシーンのボタン。「候補を出す」ボタンは置かない。
// シーンを押した時点で候補を取る。シーンを選んだあとに価格帯を押したら、その場で出し直す。
// シーン未選択で価格帯だけを押したときは、選ぶだけで API は呼ばない（エラーも出さない）。
export function SearchForm() {
  const [scene, setScene] = useState<Scene | null>(null);
  const [band, setBand] = useState<PriceBand | null>(null);
  const [state, setState] = useState<SearchState>({ status: "initial" });
  const runner = useRef<SearchRunner | null>(null);

  useEffect(() => {
    const r = new SearchRunner(setState);
    runner.current = r;
    return () => r.cancel(); // 画面を離れたら、前の検索の応答は捨てる
  }, []);

  const run = (s: Scene, b: PriceBand | null) => runner.current?.run({ scene: s, priceBand: b });

  const onScene = (s: Scene) => {
    // 選んでいるシーンをもう一度押したときの動きは、仕様に書かれていない。何もしない（選択のまま）
    if (s === scene) return;
    setScene(s);
    run(s, band);
  };
  const onBand = (clicked: PriceBand) => {
    const next = togglePriceBand(band, clicked);
    setBand(next);
    if (scene) run(scene, next);
  };

  return (
    <div className={styles.form}>
      <section aria-labelledby="h-scene">
        <h2 id="h-scene" className={styles.h}>
          シーンから探す
        </h2>
        <div className={styles.row} role="group" aria-label="シーン">
          {SCENES.map((s) => (
            <button key={s} type="button" className={styles.btn} aria-pressed={scene === s} onClick={() => onScene(s)}>
              {scene === s ? "✓ " : ""}
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
            <button key={b.value} type="button" className={styles.btn} aria-pressed={band === b.value} onClick={() => onBand(b.value)}>
              {band === b.value ? "✓ " : ""}
              {b.label}
            </button>
          ))}
        </div>
      </section>
      <div className={styles.status} aria-live="polite">
        <SearchStatus state={state} priceBand={band} onRetry={() => scene && run(scene, band)} />
      </div>
    </div>
  );
}
