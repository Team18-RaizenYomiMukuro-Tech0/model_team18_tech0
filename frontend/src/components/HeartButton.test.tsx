import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FAVORITES_KEY } from "@/state/favorites";
import { HeartButton } from "./HeartButton";

const hearts = () => screen.getAllByRole("button", { name: "商品Aをお気に入り" });

describe("V-07・V-08 HeartButton", () => {
  it("V-07 ハート: 押すと登録、もう一度で解除。同じ商品のハートは同期し、保存は 1 件", () => {
    render(
      <>
        <HeartButton productId="P01" name="商品A" />
        <HeartButton productId="P01" name="商品A" />
      </>,
    );
    const [a, b] = hearts();
    expect(a.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(a);
    expect(hearts().map((h) => h.getAttribute("aria-pressed"))).toEqual(["true", "true"]);
    fireEvent.click(a);
    expect(hearts().map((h) => h.getAttribute("aria-pressed"))).toEqual(["false", "false"]);
    fireEvent.click(b); // 別のハートで押しても同じ 1 件
    expect(hearts().map((h) => h.getAttribute("aria-pressed"))).toEqual(["true", "true"]);
    expect(JSON.parse(window.localStorage.getItem(FAVORITES_KEY) ?? "null")).toEqual(["P01"]);
  });

  it("V-08 保存が例外: 画面は止まらず、押した間は登録の表示になる（保存はされない）", () => {
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage denied");
    });
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage denied");
    });
    try {
      render(<HeartButton productId="P01" name="商品A" />);
      const [h] = hearts();
      expect(() => fireEvent.click(h)).not.toThrow();
      expect(hearts()[0].getAttribute("aria-pressed")).toBe("true");
    } finally {
      set.mockRestore();
      get.mockRestore();
    }
    expect(window.localStorage.getItem(FAVORITES_KEY)).toBeNull();
  });
});
