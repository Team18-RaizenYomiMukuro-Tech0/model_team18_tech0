import type { Metadata } from "next";
import { SharedView } from "@/components/SharedView";

// SP-06 D-09 N-07 N-15 SP-19 D-36: 共有ページ /s/[share_id]。ログインなし。
// metadata は固定（DB も共有リンクの中身も読まない）。プレビュー（LINE 等）は商品名・理由・価格を出さず、
// タイトル「Giftia の贈りもの候補」・説明「どれがいいと思う？いいねで教えて。」・固定画像 ogp-share.png（1200×630）だけ。
// noindex, nofollow の meta は4つの状態すべてで枠の HTML に入る（ヘッダーは next.config.ts）。
const TITLE = "Giftia の贈りもの候補";
const DESCRIPTION = "どれがいいと思う？いいねで教えて。";
const IMAGE = { url: "/ogp-share.png", width: 1200, height: 630, alt: DESCRIPTION };
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  robots: { index: false, follow: false },
  openGraph: { title: TITLE, description: DESCRIPTION, type: "website", images: [IMAGE] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [IMAGE.url] },
};

export default async function SharedPage({ params }: Readonly<{ params: Promise<{ share_id: string }> }>) {
  const { share_id } = await params;
  return <SharedView shareId={share_id} />;
}
