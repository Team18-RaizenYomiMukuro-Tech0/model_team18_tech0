"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clearFoldOpen, foldOpenOnArrival } from "@/lib/foldHint";
import { COLLAPSE_MAX_WIDTH, conditionSummary, SHEET_MAX_WIDTH, shouldFocusListBand } from "@/lib/mobileLayout";
import { emptyMessageR02, type Fetched, type ProductList } from "@/lib/products";
import { ProductRunner } from "@/lib/searchRequest";
import { searchMode } from "@/lib/searchMode";
import { parseSearchQuery, searchHref, type SearchQuery } from "@/lib/searchQuery";
import { useAppState } from "@/state/AppState";
import { BottomBar } from "./BottomBar";
import { CandidateResults } from "./CandidateResults";
import { DetailPanel } from "./DetailPanel";
import { Pagination } from "./Pagination";
import { RecentViewed } from "./RecentViewed";
import { ProductCard } from "./ProductCard";
import { RelaxHelp } from "./RelaxHelp";
import { SearchConditions } from "./SearchConditions";
import { Searching } from "./Searching";
import { SelectedList } from "./SelectedList";
import { SortSelect } from "./SortSelect";
import cond from "./conditions.module.css";
import { useMediaQuery } from "./useMediaQuery";
import styles from "./results.module.css";

// SP-11 SP-12 D-27 F-13 F-16 F-19: 検索結果 `/search`。シーンがあれば R-01 の全件を12件ずつ（CandidateResults。GET /api/candidates）、
// 無ければ R-02 の12件ずつ（GET /api/products）。どちらを呼ぶかは searchMode（#51-2）。
// URL のクエリは GET /api/products と同じ名前（#85）。product があれば、その商品の詳細の欄を開く。条件ボタンは SearchConditions（R8）。
// R2 SP-29 SP-31 D-46: 899px 以下は詳細をシートで開き、画面の下端に 1 本の帯（共有リスト・カート）を固定する。480px 以下は条件を 1 行にたたむ。
export function SearchResults() {
  const params = useSearchParams();
  const router = useRouter();
  const q = useMemo(() => parseSearchQuery(new URLSearchParams(params.toString())), [params]);
  const narrow = useMediaQuery(`(max-width: ${SHEET_MAX_WIDTH}px)`);
  const { picked } = useAppState();
  const [listOpen, setListOpen] = useState(false);
  // 詳細を閉じる: product だけ外した検索結果に戻る（おすすめ・お気に入り・カートから開いたときも一覧が見える。元の画面には戻さない。SP-29）
  const closeDetail = useCallback(() => router.replace(searchHref(q, { product: null })), [router, q]);
  const backToBand = useRef(false);
  // NF-47: 共有リストのシートを閉じたら、帯「共有リスト N件」へ焦点を戻す（シートを開いている間は帯が無く、開いたときの要素が消えているため、閉じたあとに帯が戻ってから探す）
  const closeList = useCallback(() => {
    backToBand.current = true;
    setListOpen(false);
  }, []);
  const isR01 = q.scene != null && !q.q; // D-49 SP-35 ③: シーン＋言葉は R-02
  const listShown = listOpen && picked.length > 0; // 全部外したら、空のシートを残さない
  const bar = narrow && q.product == null && !listShown; // シートを開いている間は帯を出さない
  useEffect(() => {
    if (!shouldFocusListBand(listShown, backToBand.current)) return;
    backToBand.current = false;
    document.querySelector<HTMLElement>('nav button[data-band="list"]')?.focus();
  }, [listShown]);
  return (
    <>
      <ConditionsFold q={q} />
      {isR01 ? (
        <CandidateResults q={q} narrow={narrow} listOpen={listShown} onCloseList={closeList} onCloseDetail={closeDetail} />
      ) : (
        <ProductResults q={q} onCloseDetail={closeDetail} />
      )}
      {bar && <BottomBar isR01={isR01} picked={picked.length} onOpenList={() => setListOpen(true)} />}
    </>
  );
}

// SP-31: 480px 以下は条件の欄を 1 行の要約ボタン（aria-expanded）にたたむ。押すと 1 段目シーン・2 段目価格・3 段目からカテゴリーを開く。最初は閉じている（トップから来たときだけ、最初から開いている）。
function ConditionsFold({ q }: Readonly<{ q: SearchQuery }>) {
  const small = useMediaQuery(`(max-width: ${COLLAPSE_MAX_WIDTH}px)`);
  const [open, setOpen] = useState(foldOpenOnArrival); // SP-31: トップから移ったときだけ開いて始める。直接 /search を開いたときは閉じている
  useEffect(() => clearFoldOpen(), []);
  if (!small) return <SearchConditions q={q} />;
  return (
    <div className={styles.fold}>
      <button type="button" className={styles.foldbtn} aria-expanded={open} aria-controls="cond-fold" onClick={() => setOpen(!open)}>
        {conditionSummary(q, open)}
      </button>
      <div id="cond-fold" hidden={!open}>
        <SearchConditions q={q} />
      </div>
    </div>
  );
}

function ProductResults({ q, onCloseDetail }: Readonly<{ q: SearchQuery; onCloseDetail: () => void }>) {
  const { url } = searchMode(q);
  const [res, setRes] = useState<{ url: string; r: Fetched<ProductList> | null }>({ url: "", r: null });
  const [last, setLast] = useState<ProductList | null>(null); // 直前に出た結果（検索中に薄く残す。SP-33）
  const runner = useRef<ProductRunner | null>(null);
  const router = useRouter();

  useEffect(() => {
    const r = new ProductRunner((u, v) => {
      setRes({ url: u, r: v });
      if (v?.status === "ok" && v.data.items.length > 0) setLast(v.data);
    });
    runner.current = r;
    return () => r.cancel();
  }, []);
  useEffect(() => {
    runner.current?.run(url); // 続けて条件を変えたら、古い条件の応答は捨てる・10秒で打ち切る（ProductRunner）
  }, [url]);

  const r = res.url === url ? res.r : null;
  // R6 SP-33 S-92: 検索中は、前の結果を薄くして残し、「候補（N件）」の見出しの位置の中央に検索中の表示を出す。応答が返ったら新しい結果に置き換える
  const prev = r == null ? last : null;
  const detailId = q.product;

  return (
    <div className={styles.layout}>
      <section aria-label="検索結果" className={styles.results}>
        {q.q && (
          <p className={styles.qnote}>
            <span>「{q.q}」で探しています</span>
            <button type="button" className={styles.btn} onClick={() => router.push(searchHref(q, { q: "", page: 1, product: null }))}>
              言葉を消す
            </button>
          </p>
        )}
        {!r && (
          <div className={styles.searchslot}>
            <Searching />
          </div>
        )}
        {prev && (
          <div className={styles.stale} aria-busy="true">
            <ul className={styles.cards}>
              {prev.items.map((p) => (
                <ProductCard key={p.product_id} p={p} href={searchHref(q, { page: prev.page, product: p.product_id })} selected={p.product_id === detailId} />
              ))}
            </ul>
            <Pagination q={q} total={prev.total} page={prev.page} pageSize={prev.page_size} />
          </div>
        )}
        {r?.status === "error" && (
          <div role="alert" className={styles.deterr}>
            失敗しました。もう一度お試しください
            <button
              type="button"
              className={styles.btn}
              onClick={() => runner.current?.run(url)}
            >
              再試行
            </button>
          </div>
        )}
        {r?.status === "notfound" && <p role="status">{emptyMessageR02(q)}</p>}
        {r?.status === "ok" && r.data.items.length === 0 && (
          <div>
            <p className={styles.empty} role="status">
              {emptyMessageR02(q)}
            </p>
            <RelaxHelp q={q} relax={r.data.relax} />
          </div>
        )}
        {r?.status === "ok" && r.data.items.length > 0 && (
          <>
            {/* SP-21: 結果の見出しの右に並び替え（R-01 は CandidateResults が同じ部品を出す。見出しの文言はモックの「絞り込み結果」） */}
            <div className={cond.rhead}>
              <h2 className={cond.rtitle}>絞り込み結果</h2>
              <SortSelect q={q} />
            </div>
            <ul className={styles.cards}>
              {r.data.items.map((p) => (
                <ProductCard key={p.product_id} p={p} href={searchHref(q, { page: r.data.page, product: p.product_id })} selected={p.product_id === detailId} />
              ))}
            </ul>
            <Pagination q={q} total={r.data.total} page={r.data.page} pageSize={r.data.page_size} />
          </>
        )}
        <RecentViewed q={q} />
        <SelectedList />
      </section>
      {detailId != null && <DetailPanel productId={detailId} onClose={onCloseDetail} />}
    </div>
  );
}
