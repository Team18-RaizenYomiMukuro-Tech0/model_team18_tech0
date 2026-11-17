import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { TOP_DESCRIPTION, TOP_OGP_IMAGE, TOP_TITLE } from "@/lib/pageMeta";
import { AppStateProvider } from "@/state/AppState";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://gen13-app-step3-1-5181-fe-gufkevefgbfja0au.japaneast-01.azurewebsites.net"), // og:image を https の公開住所にする（#296）
  title: TOP_TITLE,
  description: TOP_DESCRIPTION,
  robots: { index: false, follow: false }, // D-16 N-07: 全ページに <meta name=robots content=noindex,nofollow>（X-Robots-Tag と両方。共有ページは自分の metadata で上書き）
  // SP-19 D-36: アイコンは全ページ。プレビュー（OGP）はトップとその他のページ用の固定の 1 枚（共有ページは自分の metadata で上書きする）
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }], apple: [{ url: "/icon-180.png", sizes: "180x180" }] },
  openGraph: { type: "website", title: TOP_TITLE, description: TOP_DESCRIPTION, images: [{ url: TOP_OGP_IMAGE, width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title: TOP_TITLE, description: TOP_DESCRIPTION, images: [TOP_OGP_IMAGE] },
};

// D-25: 共通ヘッダーは layout に1つ置く。D-32: 画面をまたぐ状態（選択）も layout の Context に置く
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>
        <AppStateProvider>
          <Header />
          <main>{children}</main>
        </AppStateProvider>
      </body>
    </html>
  );
}
