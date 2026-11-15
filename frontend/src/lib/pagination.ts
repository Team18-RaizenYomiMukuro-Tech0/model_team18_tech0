// SP-11 D-27 U-48 U-41 #46-5: ページ送りの計算（React を使わない純粋な部分）。1ページ12件（API の page_size を使う）。

export const PAGE_SIZE = 12;

// 「全n件中a〜b件を表示」。0件のときは出さない（0件の文言を出す）
export function rangeText(total: number, page: number, pageSize: number = PAGE_SIZE): string | null {
  if (total <= 0) return null;
  const a = (page - 1) * pageSize + 1;
  const b = Math.min(page * pageSize, total);
  return `全${total}件中${a}〜${b}件を表示`;
}

export function pageCount(total: number, pageSize: number = PAGE_SIZE): number {
  return total <= 0 ? 0 : Math.ceil(total / pageSize);
}

// ページ番号の並び（1 から最後まで）。1ページしかないときは出さない
export function pageNumbers(total: number, pageSize: number = PAGE_SIZE): number[] {
  const n = pageCount(total, pageSize);
  return n <= 1 ? [] : Array.from({ length: n }, (_, i) => i + 1);
}

// 前へ・次へ（端では null）
export function prevNext(total: number, page: number, pageSize: number = PAGE_SIZE): { prev: number | null; next: number | null } {
  const n = pageCount(total, pageSize);
  return { prev: page > 1 && n > 0 ? page - 1 : null, next: page < n ? page + 1 : null };
}

// R6 SP-32 U-72: 短いページ番号。最初と最後のページ、今のページとその前後 2 つを出し、間が 1 ページでも空けば "gap"（画面では「…」）。
// 全ページ数が 7 以下なら全部出す。1 ページだけなら番号は 1 つ。例: 全 223 ページの 6 ページ目は 1 … 4 5 6 7 8 … 223。
export type PageItem = number | "gap";
export function pageItems(total: number, page: number, pageSize: number = PAGE_SIZE): PageItem[] {
  const n = pageCount(total, pageSize);
  if (n <= 0) return [];
  if (n <= 7) return Array.from({ length: n }, (_, i) => i + 1);
  const keep = new Set<number>([1, n]);
  for (let i = page - 2; i <= page + 2; i++) if (i >= 1 && i <= n) keep.add(i);
  const sorted = [...keep].sort((a, b) => a - b);
  const out: PageItem[] = [];
  sorted.forEach((v, i) => {
    if (i > 0 && v - sorted[i - 1] > 1) out.push("gap");
    out.push(v);
  });
  return out;
}
