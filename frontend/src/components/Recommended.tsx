"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/formatPrice";
import { productCandidate } from "@/lib/selection";
import { useAppState } from "@/state/AppState";
import { productImage } from "@/lib/images";
import { ratingText } from "@/lib/products";
import { fetchRecommended, type RecommendedItem } from "@/lib/topPage";
import { CartButton } from "./CardButtons";
import { DetailPanel } from "./DetailPanel";
import { DecisionChips } from "./DecisionChips";
import { HeartButton } from "./HeartButton";
import { PickControl } from "./PickControl";
import g from "./cardParts.module.css";
import styles from "./top.module.css";

// SP-09 D-26 #46-2 #53-1: おすすめの商品。GET /api/products を条件なしで呼んだ先頭4件を4列に並べる。
// R6 SP-30 SP-16: カードは検索結果と同じ部品の並び（画像・商品名・価格・評価「4.0（120件）」・決め手の 1 行・ハート・「カートに入れる」）。画像か商品名を押すと、トップの上で詳細を開く（URL は `/` のまま。900px 以上は右から出るパネル、899px 以下はシート。#415 SP-09・S-124）。閉じるとトップの同じ位置・押したカードへ戻る。
export function Recommended() {
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [items, setItems] = useState<RecommendedItem[]>([]);
  const [tries, setTries] = useState(0); // 「もう一度」で増やして取り直す
  const { isPicked, pick, unpick } = useAppState();
  const [openId, setOpenId] = useState<string | null>(null); // 開いている詳細の商品。URL は変えない

  useEffect(() => {
    let alive = true;
    fetchRecommended().then((r) => {
      if (!alive) return;
      if (r.status === "ok") {
        setItems(r.items);
        setState("ok");
      } else setState("error");
    });
    return () => {
      alive = false;
    };
  }, [tries]);

  return (
    <section aria-labelledby="h-rec">
      <h2 id="h-rec" className={styles.h}>
        おすすめの商品
      </h2>
      {state === "error" && (
        <div className={styles.recerr} role="alert">
          おすすめの商品を読み込めませんでした
          <button
            type="button"
            className={styles.btn}
            onClick={() => {
              setState("loading");
              setTries(tries + 1);
            }}
          >
            もう一度
          </button>
        </div>
      )}
      <ul className={styles.rec}>
        {items.map((p) => {
          const open = () => setOpenId(p.product_id);
          return (
            <li key={p.product_id} className={`${styles.card} ${g.wrap}`}>
              <div className={g.grid}>
                <button type="button" tabIndex={-1} aria-hidden="true" onClick={open} className={`${styles.pic} ${styles.openbtn} ${g.pic}`}>
                  <Image src={productImage(p.category) ?? ""} alt="" width={200} height={200} unoptimized />
                  <span className={styles.imgtag}>イメージ</span>
                </button>
                <button type="button" onClick={open} className={`${styles.name} ${styles.openbtn} ${g.name}`}>
                  {p.name}
                </button>
                <span className={`${styles.price} ${g.price}`}>{formatPrice(p.price)}</span>
                {p.rating != null && p.review_count != null && (
                  <span className={`${styles.rating} ${g.meta}`}>
                    ★ {ratingText(p.rating)}（{p.review_count}件）
                  </span>
                )}
                <div className={g.chips}>
                  <DecisionChips arrivesOn={p.arrives_on} wrapping={p.wrapping} inStock />
                </div>
                <div className={g.pick}>
                  <PickControl name={p.name} picked={isPicked(p.product_id)} onToggle={() => (isPicked(p.product_id) ? unpick(p.product_id) : pick(productCandidate(p)))} />
                </div>
                <span className={g.heart}>
                  <HeartButton productId={p.product_id} name={p.name} />
                </span>
                <span className={g.cart}>
                  <CartButton productId={p.product_id} name={p.name} />
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      {openId && <DetailPanel key={openId} productId={openId} overlay onClose={() => setOpenId(null)} />}
    </section>
  );
}
