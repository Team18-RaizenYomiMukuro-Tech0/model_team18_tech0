import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { parseSearchQuery } from "@/lib/searchQuery";
import { Pagination } from "./Pagination";

const q = parseSearchQuery(new URLSearchParams("scene=送別&price_band=3000to4999"));
const pager = (page: number, total = 31) => render(<Pagination q={q} total={total} page={page} pageSize={12} />);

describe("V-21 Pagination", () => {
  it("V-21 ページ送り: 31 件・12 件ずつで 1〜3 ページ目の範囲・前へ／次へが決まり、0 件は何も出ない。押し先は同じ条件を保つ", () => {
    const a = pager(1);
    expect(screen.getByText("全31件中1〜12件を表示")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "前へ" })).toBeNull();
    const next = screen.getByRole("link", { name: "次へ" });
    const url = new URL(next.getAttribute("href") ?? "", "http://x");
    expect(url.pathname).toBe("/search");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("scene")).toBe("送別");
    expect(url.searchParams.get("price_band")).toBe("3000to4999");
    a.unmount();

    const b = pager(2);
    expect(screen.getByText("全31件中13〜24件を表示")).toBeTruthy();
    expect(screen.getByRole("link", { name: "前へ" })).toBeTruthy();
    b.unmount();

    pager(3);
    expect(screen.getByText("全31件中25〜31件を表示")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "次へ" })).toBeNull();
    expect(screen.getByRole("link", { name: "前へ" })).toBeTruthy();
  });

  it("V-21 0 件: 何も出ない", () => {
    const { container } = pager(1, 0);
    expect(container.childElementCount).toBe(0);
  });
});
