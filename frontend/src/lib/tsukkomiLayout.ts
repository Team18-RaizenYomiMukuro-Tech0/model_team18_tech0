// SP-28 D-09「8 個目以上のツッコミ」の「札と位置」（PM 11/20「全体を真ん中にする」。見本 版 3 の「新案（全体を真ん中）」）。
// 札・あかぷさん・吹き出しの位置は、画面の中心（cx＝幅÷2、cy＝高さ×0.46）だけから決める。ページの上の数は測らない（どの幅でも同じ形）。
export const TSUKKOMI_LAYOUT = {
  cyRatio: 0.46,
  card: { dx: -150, dy: -32, w: 110, h: 64 }, // 札の左端＝cx＋dx・上端＝cy＋dy
  face: { dx: 8, dy: -78 }, // あかぷさんの顔の左端・上端（顔は 110px）
  hand: { dx: 10, dy: 72 }, // 手＝顔の左端・上端から
  bubbleDy: 70, // 吹き出しの上端＝cy＋70。左右は真ん中
  harisenW: 150,
  impactW: 260,
} as const;

export type TsukkomiLayout = {
  cx: number;
  cy: number;
  card: { left: number; top: number; w: number; h: number };
  target: { x: number; y: number }; // 札の中心（ハリセンを振る先・集中線の中心）
  faceLeft: number;
  faceTop: number;
  hand: { x: number; y: number };
  rot: number; // ハリセンの向き（度）。手から札の中心への角度
  impactLeft: number;
  impactTop: number;
  bubbleTop: number;
};

export function tsukkomiLayout(width: number, height: number): TsukkomiLayout {
  const L = TSUKKOMI_LAYOUT;
  const cx = width / 2;
  const cy = height * L.cyRatio;
  const card = { left: cx + L.card.dx, top: cy + L.card.dy, w: L.card.w, h: L.card.h };
  const target = { x: card.left + card.w / 2, y: card.top + card.h / 2 };
  const faceLeft = cx + L.face.dx;
  const faceTop = cy + L.face.dy;
  const hand = { x: faceLeft + L.hand.dx, y: faceTop + L.hand.dy };
  const rot = (Math.atan2(target.y - hand.y, target.x - hand.x) * 180) / Math.PI - 180;
  return {
    cx,
    cy,
    card,
    target,
    faceLeft,
    faceTop,
    hand,
    rot,
    impactLeft: Math.min(Math.max(0, width - L.impactW), Math.max(0, target.x - 160)),
    impactTop: target.y - 100,
    bubbleTop: cy + L.bubbleDy,
  };
}

/** ハリセンの先（当たりの向き rot−6 度。手から 150px）。札の枠に入れば合格（PM 11/20「枠に入れば合格」） */
export function harisenTip(l: TsukkomiLayout, extraDeg = -6): { x: number; y: number } {
  const a = ((l.rot + extraDeg + 180) * Math.PI) / 180;
  return { x: l.hand.x + TSUKKOMI_LAYOUT.harisenW * Math.cos(a), y: l.hand.y + TSUKKOMI_LAYOUT.harisenW * Math.sin(a) };
}

export function insideCard(l: TsukkomiLayout, p: { x: number; y: number }): boolean {
  return p.x >= l.card.left && p.x <= l.card.left + l.card.w && p.y >= l.card.top && p.y <= l.card.top + l.card.h;
}
