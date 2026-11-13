import Image from "next/image";
import { CategoryTiles } from "@/components/CategoryTiles";
import { Recommended } from "@/components/Recommended";
import { TopSearch } from "@/components/TopSearch";
import { HERO_IMAGE } from "@/lib/images";
import styles from "@/components/top.module.css";

// R2 #119 D-26 SP-09: トップ `/`。上から ヒーロー → シーン3タイル・価格帯3ボタン（1組）→ カテゴリー10 → おすすめ4件。
export default function Home() {
  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div>
          <h1>
            ありがとうに、
            <br />
            ちょうどいいギフト。
          </h1>
          <p>相手とシーンに合わせて、気持ちが伝わる贈りものを。</p>
        </div>
        <Image src={HERO_IMAGE} alt="" width={1200} height={360} unoptimized priority className={styles.heroimg} />
      </section>
      <TopSearch />
      <CategoryTiles />
      <Recommended />
    </div>
  );
}
