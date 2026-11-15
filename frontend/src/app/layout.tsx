import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { AppStateProvider } from "@/state/AppState";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://gen13-app-step3-1-5181-fe-gufkevefgbfja0au.japaneast-01.azurewebsites.net"), // og:image を https の公開住所にする（#296）
  title: "Giftia",
  description: "ギフトを探して、仲間に共有リンクで送る",
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
