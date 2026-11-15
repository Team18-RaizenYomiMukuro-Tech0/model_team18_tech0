// SP-19 D-36: トップとその他のページの固定のページ情報（説明は今のサイトの見出しと下の行をつないだ文。PM 11/15）。
// 共有ページ（`app/s/[share_id]/page.tsx`）は別の固定の文で上書きする。
export const TOP_TITLE = "Giftia";
export const TOP_HEADLINE = "ありがとうに、ちょうどいいギフト。";
export const TOP_SUBLINES = ["相手とシーンに合わせて、", "気持ちが伝わる贈りものを。"] as const;
export const TOP_DESCRIPTION = `${TOP_HEADLINE}${TOP_SUBLINES.join("")}`;
export const TOP_OGP_IMAGE = "/ogp-top.png";
