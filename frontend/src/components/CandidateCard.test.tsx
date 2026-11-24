import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { candidate, P01 } from "@/test/fixtures";
import { CandidateCard } from "./CandidateCard";

const card = (item = P01, picked = false, onToggle: () => void = () => {}, href?: string) =>
  render(
    <ul>
      <CandidateCard item={item} picked={picked} onToggle={onToggle} href={href} />
    </ul>,
  );

describe("V-01〜V-05 CandidateCard", () => {
  it("V-01 カード: 商品名・価格・理由・「イメージ」が出て、順位の番号は出ない（next/image・next/link も動く）", () => {
    card(P01, false, () => {}, "/search?product=P01");
    expect(screen.getAllByText("送別の焼き菓子セット").length).toBeGreaterThan(0);
    expect(screen.getByText("4,999円（税込）")).toBeTruthy();
    expect(screen.getByText("評価が高く、送別で何度も選ばれています")).toBeTruthy();
    expect(screen.getByText("イメージ")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\d+位/);
    expect(document.querySelector("a[href='/search?product=P01']")).not.toBeNull(); // next/link
    expect(document.querySelector("img")).not.toBeNull(); // next/image
  });

  it("V-02 高評価: high_rating が true のときだけ「高評価の商品」が出る", () => {
    const { unmount } = card(candidate("A", { high_rating: true }));
    expect(screen.getByText("高評価の商品")).toBeTruthy();
    unmount();
    card(candidate("B", { high_rating: false }));
    expect(screen.queryByText("高評価の商品")).toBeNull();
  });

  it("V-03 評価の行: 評価と件数がそろったときだけ「★ 4.7（120件）」。どちらかが無ければ行ごと出ない", () => {
    const cases: [Partial<Parameters<typeof candidate>[1]>, string | null][] = [
      [{ rating: 4.7, review_count: 120 }, "★ 4.7（120件）"],
      [{ rating: 4.0, review_count: 30 }, "★ 4.0（30件）"],
      [{ rating: 4.5, review_count: null }, null],
      [{ rating: null, review_count: null }, null],
    ];
    for (const [over, text] of cases) {
      const { unmount, container } = card(candidate("R", over as never));
      if (text) expect(screen.getByText(text)).toBeTruthy();
      expect(container.textContent?.includes("★")).toBe(text !== null); // 空の「★」も出ない
      unmount();
    }
  });

  it("V-04 決め手: scene_count があるときだけ「送別で12回」が出る", () => {
    const { unmount } = card(candidate("A", { scene_count: { scene: "送別", n: 12 } }));
    expect(screen.getByText("送別で12回")).toBeTruthy();
    unmount();
    card(candidate("B", { scene_count: null }));
    expect(screen.queryByText(/で\d+回/)).toBeNull();
  });

  it("V-05 共有リストに入れる: 未選択で押すと選択の関数が呼ばれ、選択済みは「✓ リストに入れた」（aria-pressed＝true）で、もう一度押すと外す関数が呼ばれる", () => {
    const onToggle = vi.fn();
    const { rerender } = card(P01, false, onToggle);
    const add = screen.getByRole("button", { name: /^共有リストに入れる/ });
    expect(add.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(add);
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(
      <ul>
        <CandidateCard item={P01} picked={true} onToggle={onToggle} />
      </ul>,
    );
    const done = screen.getByRole("button", { name: /^✓ リストに入れた/ });
    expect(done.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(done);
    expect(onToggle).toHaveBeenCalledTimes(2);
  });
});
