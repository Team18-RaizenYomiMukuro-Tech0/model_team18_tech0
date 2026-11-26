import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { parseSearchQuery } from "@/lib/searchQuery";
import { routerPush } from "@/test/navigation";
import { SearchConditions } from "./SearchConditions";

const q = (s: string) => parseSearchQuery(new URLSearchParams(s));
const pushed = () => new URL(routerPush.mock.calls.at(-1)?.[0] as string, "http://x");

describe("V-23 SearchConditions", () => {
  it("V-23 選んだ状態: 選んだボタンは「✓ 」と aria-pressed＝true。同じボタンを押すと外す条件の URL へ移る", () => {
    render(<SearchConditions q={q("scene=送別&price_band=3000to4999")} />);
    const scene = screen.getByRole("button", { name: "✓ 送別" });
    expect(scene.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "誕生日" }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(scene);
    expect(pushed().searchParams.get("scene")).toBeNull();
    expect(pushed().searchParams.get("price_band")).toBe("3000to4999");

    fireEvent.click(screen.getByRole("button", { name: "✓ 3,000〜4,999円" }));
    expect(pushed().searchParams.get("price_band")).toBeNull();
    expect(pushed().searchParams.get("scene")).toBe("送別");
  });

  it("V-23 単一選択と複数選択: シーン・価格帯は押したものに替わり、カテゴリーは足される", () => {
    render(<SearchConditions q={q("scene=送別&price_band=3000to4999&category=食品")} />);
    fireEvent.click(screen.getByRole("button", { name: "誕生日" }));
    expect(pushed().searchParams.getAll("scene")).toEqual(["誕生日"]);
    fireEvent.click(screen.getByRole("button", { name: "5,000円〜" }));
    expect(pushed().searchParams.getAll("price_band")).toEqual(["5000plus"]);
    fireEvent.click(screen.getByRole("button", { name: "酒類" }));
    expect(pushed().searchParams.getAll("category")).toEqual(["食品", "酒類"]);
    expect(screen.getByRole("button", { name: "✓ 食品" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("V-23 条件をクリア: 選択が 1 つも無いと押せない。あれば全部外す URL へ移る", () => {
    const a = render(<SearchConditions q={q("")} />);
    expect((screen.getByRole("button", { name: "条件をクリア" }) as HTMLButtonElement).disabled).toBe(true);
    a.unmount();
    render(<SearchConditions q={q("scene=送別&category=食品")} />);
    const clear = screen.getByRole("button", { name: "条件をクリア" }) as HTMLButtonElement;
    expect(clear.disabled).toBe(false);
    fireEvent.click(clear);
    expect(pushed().pathname).toBe("/search");
    expect(pushed().search).toBe("");
  });
});
