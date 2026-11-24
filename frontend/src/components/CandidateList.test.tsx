import { describe, expect, it } from "vitest";
import { candidate } from "@/test/fixtures";
import { renderWithState } from "@/test/render";
import { CandidateList } from "./CandidateList";

describe("V-06 CandidateList", () => {
  it("V-06 一覧: 12 件は渡した順のままカード 12 枚、0 件はカード 0 枚", () => {
    const items = Array.from({ length: 12 }, (_, i) => candidate(`P${String(12 - i).padStart(2, "0")}`));
    const { container, unmount } = renderWithState(<CandidateList items={items} />);
    const names = [...container.querySelectorAll("li[data-picked]")].map((li) => li.querySelector("[title]")?.getAttribute("title"));
    expect(names).toEqual(items.map((i) => i.name));
    unmount();

    const empty = renderWithState(<CandidateList items={[]} />);
    expect(empty.container.querySelectorAll("li[data-picked]").length).toBe(0);
  });
});
