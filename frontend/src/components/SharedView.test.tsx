import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { fakeApi } from "@/test/fakeApi";
import { SharedView } from "./SharedView";

const item = (id: string, over: Record<string, unknown> = {}) => ({ product_id: id, status: "available", name: `作成時の商品${id}`, price: 3800, reason: `理由${id}`, category: "食品", ...over });
const ids = () => fakeApi("/api/share-links/abc", { body: { items: [item("P09"), item("P01", { price: 4999 })] }, delayMs: 30 });

describe("V-16〜V-18 SharedView", () => {
  it("V-16 共有ページ: 読み込み中は「読み込み中」、応答後は見出しの下に各候補の商品名・価格・理由が出る", async () => {
    ids();
    render(<SharedView shareId="abc" />);
    expect(screen.getByText("読み込み中")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "贈りもの候補", level: 1 })).toBeTruthy();
    expect(await screen.findByText("作成時の商品P09")).toBeTruthy();
    expect(screen.getByText("3,800円（税込）")).toBeTruthy();
    expect(screen.getByText("理由P09")).toBeTruthy();
    expect(screen.getByText("作成時の商品P01")).toBeTruthy();
    expect(screen.getByText("4,999円（税込）")).toBeTruthy();
    expect(screen.getByText("理由P01")).toBeTruthy();
    expect(screen.queryByText("読み込み中")).toBeNull();
  });

  it("V-17 期限切れ・見つからない・失敗: それぞれの文言が出て、商品は出ない", async () => {
    fakeApi("/api/share-links/abc", { status: 410 });
    const a = render(<SharedView shareId="abc" />);
    expect(await screen.findByText("このリンクは期限切れです")).toBeTruthy();
    expect(screen.getByText("作った人に、新しいリンクを頼んでください")).toBeTruthy();
    expect(screen.queryByText(/作成時の商品/)).toBeNull();
    a.unmount();

    fakeApi("/api/share-links/abc", { status: 404 });
    const b = render(<SharedView shareId="abc" />);
    expect(await screen.findByText("リンクが見つかりません")).toBeTruthy();
    expect(screen.queryByText(/作成時の商品/)).toBeNull();
    b.unmount();

    fakeApi("/api/share-links/abc", { status: 500 });
    render(<SharedView shareId="abc" />);
    expect(await screen.findByText(/失敗しました。もう一度お試しください/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "再試行" })).toBeTruthy();
    expect(screen.queryByText(/作成時の商品/)).toBeNull();
  });

  it("V-18 販売終了・在庫なし: 作成時の商品名・価格に、「この商品は販売終了しました」「在庫なし」が足される。ほかは通常", async () => {
    fakeApi("/api/share-links/abc", {
      body: { items: [item("P01"), item("P99", { status: "discontinued", price: 2100, category: undefined }), item("P12", { status: "out_of_stock", price: 4000 })] },
    });
    render(<SharedView shareId="abc" />);
    const lis = async (name: string) => (await screen.findByText(name)).closest("li") as HTMLElement;
    const gone = await lis("作成時の商品P99");
    expect(gone.textContent).toContain("2,100円（税込）");
    expect(gone.textContent).toContain("この商品は販売終了しました");
    const out = await lis("作成時の商品P12");
    expect(out.textContent).toContain("4,000円（税込）");
    expect(out.textContent).toContain("在庫なし");
    const normal = await lis("作成時の商品P01");
    expect(normal.textContent).not.toContain("販売終了");
    expect(normal.textContent).not.toContain("在庫なし");
  });
});
