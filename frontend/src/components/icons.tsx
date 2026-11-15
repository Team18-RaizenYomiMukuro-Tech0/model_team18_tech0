// D-37 T7: 線のアイコン（`design/icons/` の 6 つ。色は文字色＝ink、線の太さ 2.5/64、端と角は丸）。
// 大きさは基本 24px、札の中 18px、ボタンの文字の横 20px。R1 ではヘッダー（お気に入り・ログイン・カート）に使う。
const PATHS = {
  heart: <path d="M32 55C14 42 8 32 8 23a12 12 0 0 1 24-4 12 12 0 0 1 24 4c0 9-6 19-24 32z" />,
  user: (
    <>
      <circle cx="32" cy="22" r="10" />
      <path d="M11 55c0-12 9-19 21-19s21 7 21 19" />
    </>
  ),
  cart: (
    <>
      <path d="M5 10h9l6 30h31l5-23H17" />
      <circle cx="25" cy="52" r="4" />
      <circle cx="46" cy="52" r="4" />
    </>
  ),
  search: (
    <>
      <circle cx="27" cy="27" r="16" />
      <path d="M39 39l17 17" />
    </>
  ),
  box: (
    <>
      <path d="M32 8l22 11v26L32 56 10 45V19z" />
      <path d="M10 19l22 11 22-11M32 30v26" />
    </>
  ),
  ribbon: (
    <>
      <path d="M32 30c-3-12-20-16-22-8s10 12 22 8zM32 30c3-12 20-16 22-8s-10 12-22 8z" />
      <path d="M32 30l-9 24M32 30l9 24" />
    </>
  ),
} as const;

export type IconName = keyof typeof PATHS | "heart-filled";

export function Icon({ name, size = 24 }: { name: IconName; size?: 18 | 20 | 24 }) {
  const filled = name === "heart-filled";
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[filled ? "heart" : (name as keyof typeof PATHS)]}
    </svg>
  );
}
