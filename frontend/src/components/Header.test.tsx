import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Header } from "./Header";

const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe("V-24 Header（LoginButton を含む）", () => {
  it("V-24 ヘッダー: ロゴ・検索欄・お気に入り・ログイン・カートの順。ログインは「準備中」で、押すと知らせが出て 2 秒後に消える", () => {
    render(<Header />);
    const logo = screen.getByRole("img", { name: "Giftia" });
    const search = screen.getByRole("searchbox", { name: "商品名や言葉で探す" });
    const fav = screen.getByRole("button", { name: "お気に入り" });
    const login = screen.getByRole("button", { name: "ログイン（準備中）" });
    const cart = screen.getByRole("button", { name: "カート" });
    expect([before(logo, search), before(search, fav), before(fav, login), before(login, cart)]).toEqual([true, true, true, true]);
    expect(screen.getByText("準備中")).toBeTruthy();
    expect(screen.queryByText("ログインは準備中です")).toBeNull();

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    fireEvent.click(login);
    expect(screen.getByText("ログインは準備中です")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(screen.getByText("ログインは準備中です")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText("ログインは準備中です")).toBeNull();

    for (const gone of ["取引先へのお礼", "ギフトを探す", "カートに入れる"]) expect(screen.queryByText(gone)).toBeNull();
  });
});
