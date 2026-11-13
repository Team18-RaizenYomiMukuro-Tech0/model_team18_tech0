"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CATEGORIES, categoryIcon } from "@/lib/images";
import { buildSearchHref, categoryToggle } from "@/lib/topPage";
import styles from "./top.module.css";

// SP-09 D-26 #54-5 #56-1 #58-4 #61-1〜3 #62-1〜3: カテゴリー10タイル。
// 幅 480px 以下では見出し「カテゴリーから探す ▼」のボタンだけを出し、押すと10個が開く（最初は閉じる）。広い幅は常に開いた表示。
// 開閉の状態は覚えない: トップを開くたびに閉じから始まり、幅が 480px をまたいだら閉じに戻す。
// タイルを押すと、そのカテゴリー1つを選んだ状態で検索結果へ移る（2つ目からは検索結果の画面で足す。#58-4）。
export function CategoryTiles() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 480px)");
    const onChange = () => setOpen(false); // 幅が 480px をまたいだら閉じに戻す（#62-2）
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const t = categoryToggle(open);
  return (
    <section aria-labelledby="h-cat">
      <h2 id="h-cat" className={`${styles.h} ${styles.cathead_static}`}>
        カテゴリーから探す<span className={styles.multi}>（複数選べます）</span>
      </h2>
      <h2 className={`${styles.h} ${styles.cathead_toggle}`}>
        <button type="button" className={styles.catbtn} aria-expanded={t.expanded} aria-controls="catlist" onClick={() => setOpen(!open)}>
          カテゴリーから探す<span className={styles.multi}>（複数選べます）</span>
          <span className={styles.chev} aria-hidden="true">
            {t.mark}
          </span>
        </button>
      </h2>
      <div id="catlist" className={`${styles.cats} ${open ? "" : styles.shut}`}>
        {CATEGORIES.map((c) => (
          <button key={c.slug} type="button" className={styles.cat} onClick={() => router.push(buildSearchHref({ category: c.name }))}>
            <Image src={categoryIcon(c.name) ?? ""} alt="" width={40} height={40} unoptimized />
            {c.name}
          </button>
        ))}
      </div>
    </section>
  );
}
