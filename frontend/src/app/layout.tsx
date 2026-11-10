import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { AppStateProvider } from "@/state/AppState";
import "./globals.css";

export const metadata: Metadata = {
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
