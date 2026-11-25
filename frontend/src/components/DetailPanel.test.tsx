import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { fakeApi } from "@/test/fakeApi";
import { C1, detail } from "@/test/fixtures";
import { renderWithState } from "@/test/render";
import { DetailPanel } from "./DetailPanel";

const voices = () => fakeApi("/api/products/C1/voices", { body: { voices: [] } });
const show = (id = "C1") => renderWithState(<DetailPanel productId={id} onClose={() => {}} />);

describe("V-13〜V-15 DetailPanel", () => {
  it("V-13 詳細: 商品名・画像・価格・評価（件数）・配送日・ラッピング・カート・お気に入り・特徴・セット内容が出る", async () => {
    fakeApi("/api/products/C1", { body: C1 });
    voices();
    show();
    expect(await screen.findByRole("heading", { name: "季節の和菓子詰め合わせ" })).toBeTruthy();
    expect(screen.getByText("イメージ")).toBeTruthy();
    expect(screen.getAllByText("3,200円（税込）").length).toBeGreaterThan(0);
    expect(screen.getByText("★ 4.5（20件）")).toBeTruthy();
    expect(screen.getByText("11/27までに届く（目安）")).toBeTruthy();
    expect(screen.getByText("ラッピング可")).toBeTruthy();
    expect(screen.getByRole("button", { name: "カートに入れる" })).toBeTruthy();
    expect(screen.getByText(/お気に入りに追加/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "季節の和菓子詰め合わせをお気に入り" })).toBeTruthy();
    expect(screen.getByText("商品の特徴")).toBeTruthy();
    expect(screen.getByText("手づくりの和菓子を季節ごとに詰めました")).toBeTruthy();
    expect(screen.getByText("セット内容")).toBeTruthy();
    expect(screen.getByText("和菓子 8 個入り")).toBeTruthy();
  });

  it("V-14 高評価と在庫なし: high_rating が true の 4.5 だけ「高評価の商品」。4.49・欠損は出ない。在庫なしは「在庫なし」", async () => {
    voices();
    const cases: [Partial<typeof C1>, boolean][] = [
      [{ rating: 4.5, high_rating: true }, true],
      [{ rating: 4.49, high_rating: false }, false],
      [{ rating: null, review_count: null, high_rating: false }, false],
    ];
    for (const [over, badge] of cases) {
      fakeApi("/api/products/C1", { body: detail("C1", { name: "商品", ...over }) });
      const { unmount } = show();
      await screen.findByRole("heading", { name: "商品" });
      expect(screen.queryByText("高評価の商品") !== null).toBe(badge);
      unmount();
    }
    fakeApi("/api/products/C1", { body: detail("C1", { name: "商品", status: "out_of_stock" }) });
    show();
    await screen.findByRole("heading", { name: "商品" });
    expect(screen.getAllByText("在庫なし").length).toBeGreaterThan(0);
  });

  it("V-15 失敗と 404: 失敗は「もう一度」で取り直して詳細が出る。404 は「この商品は見つかりません」", async () => {
    voices();
    let ok = false;
    fakeApi("/api/products/C1", () => (ok ? { body: C1 } : { status: 500 }));
    const { unmount } = show();
    expect(await screen.findByText(/商品の情報を読み込めませんでした/)).toBeTruthy();
    ok = true;
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "もう一度" }));
    });
    expect(await screen.findByRole("heading", { name: "季節の和菓子詰め合わせ" })).toBeTruthy();
    await waitFor(() => expect(screen.queryByText(/商品の情報を読み込めませんでした/)).toBeNull());
    unmount();

    fakeApi("/api/products/C1", { status: 404 });
    show();
    expect(await screen.findByText("この商品は見つかりません")).toBeTruthy();
  });
});
