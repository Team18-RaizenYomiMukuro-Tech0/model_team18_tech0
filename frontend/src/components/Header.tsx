import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { CartButton } from "./CartPanel";
import { FavoritesButton } from "./FavoritesPanel";
import { HeaderSearch } from "./HeaderSearch";
import { HeaderHeight } from "./HeaderHeight";
import { Icon } from "./icons";

// D-25 SP-08 F-10 #41-8 #46-7 #65: 共通ヘッダー（全ページ共通。app/layout に1つ置く）。
// ロゴ（第2弾: アイコン A＋「Giftia」の画像 /logo.svg。SP-19）・検索欄（HeaderSearch。D-49 SP-35。480px 以下は虫めがね）・お気に入り・ログイン（「準備中」。押しても何も起きない）・カート。
// お気に入りは R4（D-30）で、押すと右から一覧のパネルが出る。カートは R9（D-31）で、押すと右から一覧のパネルが出る。
export function Header() {
  return (
    <header className="top">
      <Link className="logo" href="/">
        <Image src="/logo.svg" alt="Giftia" width={102} height={28} unoptimized priority />
      </Link>
      <Suspense fallback={null}>
        <HeaderSearch />
      </Suspense>
      <span className="spacer" />
      <FavoritesButton />
      <button type="button" className="hbtn" aria-label="ログイン（準備中）" aria-disabled="true">
        <span className="ico"><Icon name="user" /></span> <span className="t">ログイン</span>
        <span className="tag">準備中</span>
      </button>
      <CartButton />
      <HeaderHeight />
    </header>
  );
}
