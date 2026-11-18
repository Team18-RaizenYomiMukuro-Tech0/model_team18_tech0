import { HARISEN } from "@/lib/sharedLink";

// SP-28 D-09「ハリセンの絵」。紙を山折り・谷折りで交互にたたんだ蛇腹の扇。右端が持ち手。値は HARISEN（見本 版 5 の harisenSvg）
// 折り目は持ち手の中の 1 点（hub）から放射状。先の切り口は折り目に合わせたギザギザ。外部の画像・フォントは使わない
const H = HARISEN;
const pts = Array.from({ length: H.panels + 1 }, (_, i) => {
  const t = i / H.panels;
  let x = 4 - 7 * Math.sin(Math.PI * t);
  const y = 2 + 86 * t;
  if (i % 2) x += 8; // 谷折りの先は内側に引っ込む
  return { x: +x.toFixed(1), y: +y.toFixed(1) };
});
const [hx, hy] = H.hub;
const g = H.grip;

export function Harisen({ uid }: Readonly<{ uid: string }>) {
  return (
    <svg width={H.width} height={H.height} viewBox={`0 0 ${H.width} ${H.height}`} style={{ display: "block", overflow: "visible" }} data-testid="harisen">
      <defs>
        <linearGradient id={`hl${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={H.light[0]} />
          <stop offset=".7" stopColor={H.light[1]} />
          <stop offset="1" stopColor={H.light[2]} />
        </linearGradient>
        <linearGradient id={`hd${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={H.shade[0]} />
          <stop offset=".7" stopColor={H.shade[1]} />
          <stop offset="1" stopColor={H.shade[2]} />
        </linearGradient>
      </defs>
      {Array.from({ length: H.panels }, (_, i) => (
        <polygon key={i} data-panel={i % 2 ? "shade" : "light"} points={`${hx},${hy} ${pts[i].x},${pts[i].y} ${pts[i + 1].x},${pts[i + 1].y}`} fill={`url(#${i % 2 ? "hd" : "hl"}${uid})`} />
      ))}
      {pts.slice(1, -1).map((p, k) => {
        const i = k + 1;
        const l = i % 2 ? H.valleyLine : H.mountLine; // 谷折りは茶、山折りは白
        return <line key={i} x1={hx} y1={hy} x2={p.x} y2={p.y} stroke={l.color} strokeWidth={l.width} />;
      })}
      <polygon points={`${hx},${hy} ${pts.map((p) => `${p.x},${p.y}`).join(" ")}`} fill="none" stroke={H.edge.color} strokeWidth={H.edge.width} strokeLinejoin="round" />
      <rect x={g.x} y={g.y} width={g.w} height={g.h} rx={g.r} fill={g.color} stroke={H.edge.color} strokeWidth={H.edge.width} />
      <path d={H.tapes.map(([a, b, c, d]) => `M${a},${b} L${c},${d}`).join(" ")} stroke="#FFFFFF" strokeWidth={4} />
      <rect x={g.x} y={g.y} width={g.w} height={g.h} rx={g.r} fill="none" stroke={H.edge.color} strokeWidth={H.edge.width} />
      <path d="M106,39 L146,39" stroke="rgba(255,255,255,.5)" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}
