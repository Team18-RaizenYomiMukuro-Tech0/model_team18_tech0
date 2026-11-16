"use client";

import { useEffect, useState } from "react";
import { SearchRunner, type SearchState } from "@/lib/api";
import { searchMode } from "@/lib/searchMode";
import type { RightTab } from "@/lib/rightColumn";
import { searchHref, type SearchQuery } from "@/lib/searchQuery";
import { useAppState } from "@/state/AppState";
import { CandidateList } from "./CandidateList";
import { DetailPanel } from "./DetailPanel";
import { Sheet } from "./Sheet";
import { RecentViewed } from "./RecentViewed";
import { RightColumn } from "./RightColumn";
import { SearchStatus } from "./SearchStatus";
import { SelectedList } from "./SelectedList";
import results from "./results.module.css";

// F-19 SP-15 D-27 D-08 D-32: 検索結果 `/search?scene=…` の R-01（シーンあり）。10件を順位・理由・「選ぶ」つきで出し、下に「選んだ候補」の欄。
// 条件（シーン・価格帯・カテゴリー）は URL から読む。変わったら出し直し、古い応答は捨てる・10秒で打ち切る（SearchRunner。F1 から引き継ぎ）。
// 選んだ候補は layout の Context（D-32）にあるので、トップへ戻って押し直しても残る。
// R5 SP-29 D-46: 900px 以上は右の列をタブ（詳細／共有リスト（N件））にする。カードを押すと、いつも詳細のタブが出る。キーボードの Enter で押したときだけ詳細の商品名へ焦点を移す。
// R2 D-46: 899px 以下は、共有リスト（選んだ候補）を帯から開くシートに入れる（閉じていても中身は残す）。900px 以上は今のまま結果の下。
export function CandidateResults({ q, narrow, listOpen, onCloseList, onCloseDetail }: Readonly<{ q: SearchQuery; narrow: boolean; listOpen: boolean; onCloseList: () => void; onCloseDetail: () => void }>) {
  const { url } = searchMode(q);
  const scene = q.scene;
  const [state, setState] = useState<{ url: string; s: SearchState }>({ url: "", s: { status: "loading" } });
  const [tries, setTries] = useState(0);
  const [last, setLast] = useState<Extract<SearchState, { status: "results" }> | null>(null); // 直前の結果（検索中に薄く残す。SP-33）

  useEffect(() => {
    if (!scene) return;
    const runner = new SearchRunner((s) => {
      setState({ url, s });
      if (s.status === "results") setLast(s);
    });
    runner.run({ scene, priceBand: q.priceBand, categories: q.categories });
    return () => runner.cancel(); // 条件が変わったら・画面を離れたら、前の検索の応答は捨てる
  }, [url, tries]); // eslint-disable-line react-hooks/exhaustive-deps -- url が scene・価格帯・カテゴリーのすべてを含む

  const s: SearchState = state.url === url ? state.s : { status: "loading" };
  // R6 SP-33: 検索中は前の結果（10件）を薄くして残す。見出しの位置の中央に検索中の表示（SearchStatus）。応答が返ったら置き換える
  const prev = s.status === "loading" ? last : null;
  const detailId = q.product;
  const { picked } = useAppState();
  const [tab, setTab] = useState<RightTab>("detail"); // 最初はいつも詳細（URL には入れない。再読み込みも 900px をまたいでも詳細に戻る）
  const [focusKey, setFocusKey] = useState<number | null>(null);
  const [wasNarrow, setWasNarrow] = useState(narrow);
  if (wasNarrow !== narrow) {
    setWasNarrow(narrow);
    setTab("detail");
    setFocusKey(null);
  }
  // カードを押す（名前のリンク）と、共有リストのタブを開いていても詳細に戻る。Enter（click の detail が 0）のときだけ焦点を商品名へ
  const onCards = (e: React.MouseEvent) => {
    if (narrow || !(e.target as HTMLElement).closest("a[href]")) return;
    setTab("detail");
    if (e.detail === 0) setFocusKey((k) => (k ?? 0) + 1);
    else setFocusKey(null);
  };

  return (
    <div className={results.layout}>
      <section aria-label="検索結果" className={results.results}>
        <div aria-live="polite" className={s.status === "loading" ? results.searchslot : undefined}>
          <SearchStatus state={s} q={q} onRetry={() => setTries(tries + 1)} />
        </div>
        {prev && (
          <div className={results.stale} aria-busy="true">
            <CandidateList items={prev.items} hrefFor={(id) => searchHref(q, { product: id })} selectedId={detailId} />
          </div>
        )}
        {s.status === "results" && (
          <div onClick={onCards}>
            <CandidateList items={s.items} hrefFor={(id) => searchHref(q, { product: id })} selectedId={detailId} />
          </div>
        )}
        <RecentViewed q={q} />
        {narrow && (
          <Sheet open={listOpen} label="共有リスト" onClose={onCloseList}>
            <div className={results.listpad}>
              <SelectedList />
            </div>
          </Sheet>
        )}
      </section>
      {narrow ? (
        detailId != null && <DetailPanel productId={detailId} onClose={onCloseDetail} scene={q.scene} similarHref={(id) => searchHref(q, { product: id })} />
      ) : (
        <RightColumn tab={tab} onTab={setTab} detailId={detailId} onCloseDetail={onCloseDetail} focusKey={focusKey} picked={picked.length} scene={q.scene} similarHref={(id) => searchHref(q, { product: id })} />
      )}
    </div>
  );
}
