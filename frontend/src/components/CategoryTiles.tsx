"use client";

import { markFoldOpen } from "@/lib/foldHint";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CATEGORIES, categoryIcon } from "@/lib/images";
import { CATEGORY_FIRST_COUNT, buildSearchHref, categoryToggle } from "@/lib/topPage";
import styles from "./top.module.css";

// SP-09 D-26 T-5 #54-5 #56-1 #58-4 #61: カテゴリー10タイル。並びは lib/images.ts の 1 つの定数。
// 幅 480px 以下では先頭の 4 つだけ出し、その下のボタン「ほか6個を見る」で残りを開く（開いたら「ほか6個を閉じる」で最初の 4 つに戻る）。481px 以上は常に 10 個でボタンは出ない。
// 見出し「カテゴリーから探す」は押しても開閉しない（▼・▲ は付けない）。開閉は覚えない: 開くたびに 4 つだけの状態から始め、幅が 480px をまたいだら戻す。
// タイルを押すと、そのカテゴリー1つを選んだ状態で検索結果へ移る（2つ目からは検索結果の画面で足す。#58-4）。
export function CategoryTiles() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 480px)");
    const onChange = () => setOpen(false);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const t = categoryToggle(open, CATEGORIES.length);
  return (
    <section aria-labelledby="h-cat">
      <h2 id="h-cat" className={styles.h}>
        カテゴリーから探す
      </h2>
      <div id="catlist" className={`${styles.cats} ${open ? "" : styles.shut}`}>
        {CATEGORIES.map((c, i) => (
          <button key={c.slug} type="button" className={`${styles.cat} ${i >= CATEGORY_FIRST_COUNT ? styles.more : ""}`} onClick={() => {
              markFoldOpen();
              router.push(buildSearchHref({ category: c.name }));
            }}>
            <Image src={categoryIcon(c.name) ?? ""} alt="" width={28} height={28} unoptimized />
            {c.name}
          </button>
        ))}
      </div>
      <button type="button" className={styles.morebtn} aria-expanded={t.expanded} aria-controls="catlist" onClick={() => setOpen(!open)}>
        {t.label}
      </button>
    </section>
  );
}
