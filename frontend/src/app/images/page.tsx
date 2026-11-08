import Image from "next/image";
import { Searching } from "@/components/Searching";
import { CATEGORIES, HERO_IMAGE, categoryIcon, productImage } from "@/lib/images";

// R7 #116: 画像の確認用の表示。トップ・検索結果の組み立ては R2・R6 が行う（ここは画像を並べて確かめるだけ）。
export const metadata = { title: "画像の確認（R7）" };

export default function ImagesCheck() {
  return (
    <div className="imgcheck">
      <h1>画像の確認（R7 #116）</h1>
      <p className="note">トップ・検索結果の組み立ては R2・R6。ここは画像だけを並べた確認用の表示です。</p>

      <h2>ヒーロー</h2>
      <div className="hero-box">
        <Image src={HERO_IMAGE} alt="" width={1200} height={360} unoptimized priority />
      </div>

      <h2>カテゴリー（{CATEGORIES.length}個）</h2>
      <ul className="cats">
        {CATEGORIES.map((c) => (
          <li key={c.slug}>
            <Image src={categoryIcon(c.name) ?? ""} alt="" width={48} height={48} unoptimized />
            <span>{c.name}</span>
          </li>
        ))}
      </ul>

      <h2>商品カードの画像（カテゴリー共通・イメージ表記）</h2>
      <ul className="cards">
        {CATEGORIES.map((c) => (
          <li key={c.slug} className="card">
            <div className="pic">
              <Image src={productImage(c.name) ?? ""} alt="" width={200} height={200} unoptimized />
              <span className="imgtag">イメージ</span>
            </div>
            <span>{c.name}</span>
          </li>
        ))}
      </ul>

      <h2>検索中（動きを減らす設定では回さず文字を出す）</h2>
      <Searching />
    </div>
  );
}
