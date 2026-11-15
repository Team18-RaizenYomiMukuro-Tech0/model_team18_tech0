"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { formatPrice } from "@/lib/formatPrice";
import { SHEET_MAX_WIDTH } from "@/lib/mobileLayout";
import { productImage } from "@/lib/images";
import { arrivesText } from "@/lib/arrival";
import { GIFT_DATE_LABEL, giftVerdict } from "@/lib/giftDate";
import { track } from "@/lib/tracking";
import { recentStore } from "@/state/recent";
import { fetchJson, fetchVoices, isProductDetail, productUrl, ratingText, type Fetched, type ProductDetail, type VoiceList } from "@/lib/products";
import { VOICES_HEADING, voiceViews } from "@/lib/voices";
import { cartStore } from "@/state/cart";
import type { Scene } from "@/lib/api";
import { DecisionChips } from "./DecisionChips";
import { HeartButton } from "./HeartButton";
import { Searching } from "./Searching";
import { Sheet } from "./Sheet";
import { SimilarProducts } from "./SimilarProducts";
import { useMediaQuery } from "./useMediaQuery";
import styles from "./results.module.css";

// SP-12 F-14 F-16 D-29 #53-5 #54-6 #55-4 #58-10: 検索結果の右の詳細の欄。
// 商品名・画像・価格（税込）・評価（件数）・「高評価の商品」・配送日数・ラッピング・商品の特徴・セット内容・「カートに入れる」と「お気に入りに追加」。
// 値が無い項目は出さない。在庫0は「在庫なし」。取得が通信の失敗なら「商品の情報を読み込めませんでした」と「もう一度」、404 なら「この商品は見つかりません」だけ。
// R2 SP-29 D-46: 899px 以下は下から出るシート（閉じるボタン・Esc。開いたら商品名へ焦点）、900px 以上は右の欄。
// どちらも一番下に「{価格}（税込）［カートに入れる］」の帯を固定する（`position: sticky; bottom: 0`。在庫 0 は「在庫なし」で押せない）。
// R4 SP-12 SP-16 SP-17 D-29 D-35: 商品名・画像・価格・評価のすぐ下に決め手の 1 行（カードと同じ部品）、その下に「贈った人の声」（読めた分だけ。0 件・失敗は欄ごと出さない）。
// scene は R-01 から開いたときだけ渡す（D-29。「{シーン}で{n}回」を出すため）。R-02・おすすめ・お気に入り・カート・共有ページから開いたときは渡さない。
// R8 SP-22 SP-25 SP-27 SP-34 D-42 D-46 D-47: 詳細が出たら最近見た商品の先頭に入れ（404・失敗は入れない）、③「詳細を開く」の計測を 1 回送る（声の有無つき。声の取得が済んでから）。
// 声の下に似た商品（scene があるときだけ。similarHref は押したときの行き先）。届く日のそばに「贈る日（任意）」（入れた日は保存せず、別の商品に替えても残す）。
export function DetailPanel({ productId, onClose, scene = null, similarHref }: Readonly<{ productId: string; onClose: () => void; scene?: string | null; similarHref?: (id: string) => string }>) {
  const sheet = useMediaQuery(`(max-width: ${SHEET_MAX_WIDTH}px)`);
  const [state, setState] = useState<{ id: string; r: Fetched<ProductDetail> | null }>({ id: productId, r: null });
  const [tries, setTries] = useState(0);
  const [voices, setVoices] = useState<{ id: string; v: VoiceList | null; done: boolean }>({ id: productId, v: null, done: false });
  const [gift, setGift] = useState(""); // 贈る日（SP-27）。保存しない。別の商品に替えても残す
  const tracked = useRef("");

  useEffect(() => {
    const abort = new AbortController();
    fetchJson(productUrl(productId, scene), isProductDetail, abort.signal).then((r) => {
      if (!abort.signal.aborted) setState({ id: productId, r });
    });
    return () => abort.abort();
  }, [productId, scene, tries]);
  // 声は別の API（D-35）。詳細の表示を待たせず、読めた分だけ出す（失敗・0 件は欄ごと出さない）
  useEffect(() => {
    const abort = new AbortController();
    fetchVoices(productId, abort.signal).then((r) => {
      if (!abort.signal.aborted) setVoices({ id: productId, v: r.status === "ok" ? r.data : null, done: true });
    });
    return () => abort.abort();
  }, [productId]);

  // 別のカードを押した直後は、前の商品の中身を出さない
  const r = state.id === productId ? state.r : null;
  const okId = r?.status === "ok" ? productId : null;
  const voicesDone = voices.id === productId && voices.done;
  const hasVoice = voices.id === productId && voiceViews(voices.v?.voices).length > 0;
  useEffect(() => {
    if (okId) recentStore.add(okId); // 詳細に商品が出たとき（404・失敗は入れない。SP-22）
  }, [okId]);
  useEffect(() => {
    if (!okId || !voicesDone || tracked.current === `${okId}|${scene ?? ""}`) return;
    tracked.current = `${okId}|${scene ?? ""}`;
    track(3, { scene: (scene as Scene | null) ?? null, has_voice: hasVoice }); // ③ 詳細を開く（SP-34）
  }, [okId, voicesDone, hasVoice, scene]);

  const content = (
    <>
      {!r && (
        <div className={styles.detpad}>
          <Searching />
        </div>
      )}
      {r?.status === "notfound" && (
        <p role="status" className={styles.detpad}>
          この商品は見つかりません
        </p>
      )}
      {r?.status === "error" && (
        <div role="alert" className={`${styles.deterr} ${styles.detpad}`}>
          商品の情報を読み込めませんでした
          <button
            type="button"
            className={styles.btn}
            onClick={() => {
              setState({ id: productId, r: null });
              setTries(tries + 1);
            }}
          >
            もう一度
          </button>
        </div>
      )}
      {r?.status === "ok" && <Body p={r.data} focusName={sheet} voices={voices.id === productId ? voices.v : null} scene={scene} similarHref={similarHref} gift={gift} onGift={setGift} />}
      {r?.status === "ok" && <Foot p={r.data} />}
    </>
  );
  if (sheet) {
    return (
      <Sheet label="商品の詳細" onClose={onClose}>
        {content}
      </Sheet>
    );
  }
  return (
    <aside className={styles.detail} aria-label="商品の詳細">
      {content}
    </aside>
  );
}

// 一番下の固定の帯: {価格}（税込）［カートに入れる］。在庫 0 は「在庫なし」で押せない（SP-18）。押すと giftia:cart に追加（同じ商品は数量+1。D-31）
function Foot({ p }: Readonly<{ p: ProductDetail }>) {
  const out = p.status === "out_of_stock";
  return (
    <div className={styles.detfoot}>
      <span className={styles.footprice}>{formatPrice(p.price)}</span>
      {out ? (
        <button type="button" className={styles.footbtn} disabled>
          在庫なし
        </button>
      ) : (
        <button type="button" className={styles.footbtn} data-primary="true" onClick={() => cartStore.add(p.product_id)}>
          カートに入れる
        </button>
      )}
    </div>
  );
}

function Body({ p, focusName, voices, scene, similarHref, gift, onGift }: Readonly<{ p: ProductDetail; focusName: boolean; voices: VoiceList | null; scene: string | null; similarHref?: (id: string) => string; gift: string; onGift: (v: string) => void }>) {
  const img = productImage(p.category);
  const views = voiceViews(voices?.voices);
  const verdict = giftVerdict(p.arrives_on, gift);
  const name = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusName) name.current?.focus(); // シートが開いたら、読めた商品名へ焦点（D-46）
  }, [focusName, p.product_id]);
  return (
    <div className={`${styles.detbody} ${styles.detpad}`}>
      <h2 className={styles.detname} ref={name} tabIndex={-1}>
        {p.name}
      </h2>
      <span className={styles.pic}>
        {img && <Image src={img} alt="" width={240} height={240} unoptimized />}
        <span className={styles.imgtag}>イメージ</span>
      </span>
      {p.high_rating && <span className={styles.badge}>高評価の商品</span>}
      {p.status === "out_of_stock" && <span className={styles.stockout}>在庫なし</span>}
      <span className={styles.pricerow}>
        <span className={styles.price}>{formatPrice(p.price)}</span>
        {p.rating != null && p.review_count != null && (
          <span className={styles.meta}>
            ★ {ratingText(p.rating)}（{p.review_count}件）
          </span>
        )}
      </span>
      <DecisionChips arrivesOn={p.arrives_on} wrapping={p.wrapping} inStock={p.status === "available"} sceneCount={p.scene_count} />
      {arrivesText(p.arrives_on) && (
        <div className={styles.gift}>
          <label className={styles.giftlabel}>
            {GIFT_DATE_LABEL}
            <input type="date" className={styles.giftinput} value={gift} onChange={(e) => onGift(e.target.value)} />
          </label>
          <span role="status" className={styles.verdict}>
            {verdict}
          </span>
        </div>
      )}
      {views.length > 0 && (
        <section className={styles.voices} aria-labelledby="h-voices">
          <h3 id="h-voices" className={styles.vh3}>
            {VOICES_HEADING}
          </h3>
          <ul className={styles.vlist}>
            {views.map((v, i) => (
              <li key={i} className={styles.voice}>
                <span>{v.quote}</span> <span className={styles.stars}>{v.stars}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {scene && similarHref && <SimilarProducts productId={p.product_id} scene={scene} hrefFor={similarHref} />}
      {p.description && (
        <p className={styles.dt}>
          <b>商品の特徴</b>
          <br />
          {p.description}
        </p>
      )}
      {p.size && (
        <p className={styles.dt}>
          <b>セット内容</b>
          <br />
          {p.size}
        </p>
      )}
      <div className={styles.actions}>
        <span className={styles.favrow}>
          お気に入りに追加 <HeartButton productId={p.product_id} name={p.name} />
        </span>
      </div>
    </div>
  );
}
