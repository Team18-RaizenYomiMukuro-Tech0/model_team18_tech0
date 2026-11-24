import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { fakeApi } from "@/test/fakeApi";
import { detail } from "@/test/fixtures";
import { favoritesStore } from "@/state/favorites";
import { FavoritesButton } from "./FavoritesPanel";

describe("V-09 FavoritesButton（お気に入りのパネル）", () => {
  it("V-09 パネル: 2 件で「お気に入り（2件）」、外すと 1 件になり商品が消える。0 件は「まだ登録した商品はありません。」", async () => {
    favoritesStore.add("P01");
    favoritesStore.add("P02");
    fakeApi("/api/products/P01", { body: detail("P01", { name: "焼き菓子" }) });
    fakeApi("/api/products/P02", { body: detail("P02", { name: "紅茶" }) });
    const { unmount } = render(<FavoritesButton />);
    fireEvent.click(screen.getByRole("button", { name: "お気に入り" }));
    expect(await screen.findByText("お気に入り（2件）")).toBeTruthy();
    expect(await screen.findByText("焼き菓子")).toBeTruthy();
    expect(await screen.findByText("紅茶")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "焼き菓子を外す" }));
    await waitFor(() => expect(screen.getByText("お気に入り（1件）")).toBeTruthy());
    expect(screen.queryByText("焼き菓子")).toBeNull();
    expect(screen.getByText("紅茶")).toBeTruthy();
    unmount();

    favoritesStore.remove("P02");
    render(<FavoritesButton />);
    fireEvent.click(screen.getByRole("button", { name: "お気に入り" }));
    expect(await screen.findByText("まだ登録した商品はありません。")).toBeTruthy();
    expect(screen.getByText("お気に入り（0件）")).toBeTruthy();
  });
});
