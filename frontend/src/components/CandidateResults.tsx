"use client";

import { useEffect, useState } from "react";
import { SearchRunner, type SearchState } from "@/lib/api";
import { searchMode } from "@/lib/searchMode";
import { searchHref, type SearchQuery } from "@/lib/searchQuery";
import { CandidateList } from "./CandidateList";
import { DetailPanel } from "./DetailPanel";
import { SearchStatus } from "./SearchStatus";
import { SelectedList } from "./SelectedList";
import results from "./results.module.css";

// F-19 SP-15 D-27 D-08 D-32: 検索結果 `/search?scene=…` の R-01（シーンあり）。10件を順位・理由・「選ぶ」つきで出し、下に「選んだ候補」の欄。
// 条件（シーン・価格帯・カテゴリー）は URL から読む。変わったら出し直し、古い応答は捨てる・10秒で打ち切る（SearchRunner。F1 から引き継ぎ）。
// 選んだ候補は layout の Context（D-32）にあるので、トップへ戻って押し直しても残る。
export function CandidateResults({ q }: Readonly<{ q: SearchQuery }>) {
  const { url } = searchMode(q);
  const scene = q.scene;
  const [state, setState] = useState<{ url: string; s: SearchState }>({ url: "", s: { status: "loading" } });
  const [tries, setTries] = useState(0);

  useEffect(() => {
    if (!scene) return;
    const runner = new SearchRunner((s) => setState({ url, s }));
    runner.run({ scene, priceBand: q.priceBand, categories: q.categories });
    return () => runner.cancel(); // 条件が変わったら・画面を離れたら、前の検索の応答は捨てる
  }, [url, tries]); // eslint-disable-line react-hooks/exhaustive-deps -- url が scene・価格帯・カテゴリーのすべてを含む

  const s: SearchState = state.url === url ? state.s : { status: "loading" };
  const detailId = q.product;

  return (
    <div className={results.layout}>
      <section aria-label="検索結果" className={results.results}>
        <div aria-live="polite">
          <SearchStatus state={s} q={q} onRetry={() => setTries(tries + 1)} />
        </div>
        {s.status === "results" && <CandidateList items={s.items} hrefFor={(id) => searchHref(q, { product: id })} selectedId={detailId} />}
        <SelectedList />
      </section>
      {detailId != null && <DetailPanel productId={detailId} />}
    </div>
  );
}
