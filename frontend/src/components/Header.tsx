import Link from "next/link";
import { Suspense } from "react";
import { CartButton } from "./CartPanel";
import { FavoritesButton } from "./FavoritesPanel";
import { HeaderSearch } from "./HeaderSearch";

// D-25 SP-08 F-10 #41-8 #46-7 #65: 共通ヘッダー（全ページ共通。app/layout に1つ置く）。
// ロゴ・検索欄（HeaderSearch。D-49 SP-35。スマホは虫めがね）・お気に入り・ログイン（「準備中」。押しても何も起きない）・カート。
// お気に入りは R4（D-30）で、押すと右から一覧のパネルが出る。カートは R9（D-31）で、押すと右から一覧のパネルが出る。
export function Header() {
  return (
    <header className="top">
      <Link className="logo" href="/" aria-label="Giftia トップへ">
        <i aria-hidden="true" />
        Giftia
      </Link>
      <Suspense fallback={null}>
        <HeaderSearch />
      </Suspense>
      <span className="spacer" />
      <FavoritesButton />
      <button type="button" className="hbtn hlogin" aria-label="ログイン（準備中）" aria-disabled="true">
        <span aria-hidden="true">👤</span> <span className="t">ログイン</span>
        <span className="tag">準備中</span>
      </button>
      <CartButton />
    </header>
  );
}
