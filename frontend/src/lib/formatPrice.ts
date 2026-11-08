// N-13 U-36 NF-29 #41-9: 価格は「1,500円（税込）」（カンマ区切り、「円」の後ろに「（税込）」）。
// API の price は整数のまま返り、画面がここで組み立てる（#39-7）。
export function formatPrice(price: number): string {
  return `${price.toLocaleString("en-US")}円（税込）`;
}
