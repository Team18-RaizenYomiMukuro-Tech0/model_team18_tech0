import Link from "next/link";

// D-25 SP-08 F-10 #41-8 #46-7 #65: 共通ヘッダー（全ページ共通。app/layout に1つ置く）。
// ロゴ・検索欄（disabled・薄い字で「準備中」）・お気に入り・ログイン（「準備中」。押しても何も起きない）・カート。
// お気に入り・カートの中身は後の Issue（ここは入口だけ）。
export function Header() {
  return (
    <header className="top">
      <Link className="logo" href="/" aria-label="Giftia トップへ">
        <i aria-hidden="true" />
        Giftia
      </Link>
      <div className="hsearch">
        <input type="text" aria-label="商品名で探す（準備中）" placeholder="準備中" disabled />
      </div>
      <span className="spacer" />
      <button type="button" className="hbtn" aria-label="お気に入り">
        <span aria-hidden="true">♡</span> <span className="t">お気に入り</span>
      </button>
      <button type="button" className="hbtn" aria-label="ログイン（準備中）" aria-disabled="true">
        <span aria-hidden="true">👤</span> <span className="t">ログイン</span>
        <span className="tag">準備中</span>
      </button>
      <button type="button" className="hbtn" aria-label="カート">
        <span aria-hidden="true">🛒</span> <span className="t">カート</span>
      </button>
    </header>
  );
}
