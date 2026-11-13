import type { Metadata } from "next";
import { SharedView } from "@/components/SharedView";

// SP-06 D-09 N-07 N-15: 共有ページ /s/[share_id]。ログインなし。
// metadata は固定（DB も共有リンクの中身も読まない）。プレビュー（LINE 等）は商品名を出さず「Giftia の贈りもの候補」だけ。
// og:description・og:image は付けない。noindex, nofollow の meta は4つの状態すべてで枠の HTML に入る（ヘッダーは next.config.ts）。
export const metadata: Metadata = {
  title: "Giftia の贈りもの候補",
  description: null,
  robots: { index: false, follow: false },
  openGraph: { title: "Giftia の贈りもの候補", type: "website" },
  twitter: { card: "summary", title: "Giftia の贈りもの候補" },
};

export default async function SharedPage({ params }: Readonly<{ params: Promise<{ share_id: string }> }>) {
  const { share_id } = await params;
  return <SharedView shareId={share_id} />;
}
