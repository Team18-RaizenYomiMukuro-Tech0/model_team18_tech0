import type { Voice } from "./products.ts";

// R4 SP-17 D-35: 贈った人の声。見出し「贈った人の声」、本文は「」で囲み、星は「★5」。0 件・読めなかったときは欄ごと（見出しも）出さない。
// 選び方（rating 4 以上・新しい順・同じ文は 1 件・最大 2 件）は API の仕事。画面は返ってきた分を最大 2 件、そのまま全文で出す（切らない）。
export const VOICES_HEADING = "贈った人の声";
export const VOICES_MAX = 2;

export type VoiceView = { quote: string; stars: string };

export function voiceViews(voices: readonly Voice[] | null | undefined): VoiceView[] {
  return (voices ?? [])
    .filter((v) => v.text.trim() !== "")
    .slice(0, VOICES_MAX)
    .map((v) => ({ quote: `「${v.text}」`, stars: `★${v.rating}` }));
}
