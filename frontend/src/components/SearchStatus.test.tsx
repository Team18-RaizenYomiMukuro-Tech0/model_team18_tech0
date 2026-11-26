import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SearchState } from "@/lib/api";
import { parseSearchQuery } from "@/lib/searchQuery";
import { SearchStatus } from "./SearchStatus";

const noCond = parseSearchQuery(new URLSearchParams("scene=送別"));
const withBand = parseSearchQuery(new URLSearchParams("scene=送別&price_band=3000to4999"));
const show = (state: SearchState, q = noCond, onRetry = () => {}) => render(<SearchStatus state={state} q={q} onRetry={onRetry} />);

describe("V-22 SearchStatus", () => {
  it("V-22 状態: 結果あり・0 件（条件で文言が決まる）・失敗（再試行）・検索中が見分けられる", () => {
    const results = show({ status: "results", items: [], count: 8, total: 8, page: 1, pageSize: 12 });
    expect(screen.getByRole("heading", { name: /候補（8件）/ })).toBeTruthy();
    results.unmount();

    const band = show({ status: "empty" }, withBand);
    expect(screen.getByText("条件に合う商品がありません。価格帯を変えてみてください")).toBeTruthy();
    band.unmount();

    const none = show({ status: "empty" });
    expect(screen.getByText("この条件に合う商品がありません。シーンを変えてみてください")).toBeTruthy();
    none.unmount();

    const loading = show({ status: "loading" });
    expect(screen.getByText("検索中")).toBeTruthy();
    expect(screen.queryByText(/候補（/)).toBeNull();
    expect(screen.queryByText(/条件に合う商品がありません/)).toBeNull();
    expect(screen.queryByText(/失敗しました/)).toBeNull();
    loading.unmount();
  });

  it("V-22 失敗: 「失敗しました。もう一度お試しください」と「再試行」。押すと呼ばれる", () => {
    const onRetry = vi.fn();
    show({ status: "error" }, noCond, onRetry);
    expect(screen.getByText(/失敗しました。もう一度お試しください/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "再試行" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
