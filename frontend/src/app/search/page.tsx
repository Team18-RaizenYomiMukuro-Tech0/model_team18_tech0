import { Suspense } from "react";
import { SearchResults } from "@/components/SearchResults";

// R6 #121 D-27: 検索結果 `/search`。まずシーンなしの R-02（12件ずつ・詳細の欄）。R3（#120）があとからシーンありの10件を載せる。
export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchResults />
    </Suspense>
  );
}
