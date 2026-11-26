import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { fakeApi } from "@/test/fakeApi";
import { detail } from "@/test/fixtures";
import { cartStore } from "@/state/cart";
import { CartButton } from "./CartPanel";

const open = () => fireEvent.click(screen.getByRole("button", { name: "カート" }));

describe("V-10〜V-12 CartButton（カートのパネル）", () => {
  it("V-10 数量: 100・150 は 99 になり、99 では「1増やす」・1 では「1減らす」が押せない", async () => {
    cartStore.add("P01");
    fakeApi("/api/products/P01", { body: detail("P01", { name: "焼き菓子" }) });
    render(<CartButton />);
    open();
    const qty = (await screen.findByRole("textbox", { name: "焼き菓子の数量" })) as HTMLInputElement;
    expect(qty.value).toBe("1");
    expect((screen.getByRole("button", { name: "焼き菓子の数量を1減らす" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(qty, { target: { value: "100" } });
    fireEvent.blur(qty);
    expect(qty.value).toBe("99");
    expect((screen.getByRole("button", { name: "焼き菓子の数量を1増やす" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(qty, { target: { value: "5" } });
    fireEvent.blur(qty);
    expect(qty.value).toBe("5");
    fireEvent.change(qty, { target: { value: "150" } });
    fireEvent.blur(qty);
    expect(qty.value).toBe("99");
    expect((screen.getByRole("button", { name: "焼き菓子の数量を1増やす" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("V-11 販売終了（404）と在庫なし: それぞれの文言が出て、合計に入らない", async () => {
    cartStore.add("P01");
    cartStore.add("P02");
    fakeApi("/api/products/P01", { status: 404, body: { detail: "not found" } });
    fakeApi("/api/products/P02", { body: detail("P02", { name: "紅茶", status: "out_of_stock" }) });
    render(<CartButton />);
    open();
    expect(await screen.findByText("この商品は見つかりません")).toBeTruthy();
    expect(await screen.findByText("販売終了（合計に入りません）")).toBeTruthy();
    expect(await screen.findByText("在庫なし（合計に入りません）")).toBeTruthy();
    expect(screen.getByText("0円（税込）")).toBeTruthy(); // 合計
  });

  it("V-12 削除: 行が消え、「カートに入っている商品はありません。」と「カート（0件）」が出る", async () => {
    cartStore.add("P01");
    fakeApi("/api/products/P01", { body: detail("P01", { name: "焼き菓子" }) });
    render(<CartButton />);
    open();
    expect(await screen.findByText("カート（1件）")).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: "焼き菓子を削除" }));
    expect(screen.getByText("カートに入っている商品はありません。")).toBeTruthy();
    expect(screen.getByText("カート（0件）")).toBeTruthy();
    expect(screen.queryByText("焼き菓子")).toBeNull();
  });
});
