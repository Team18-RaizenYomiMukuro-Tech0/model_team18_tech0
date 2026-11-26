// 描画テスト共通の準備（テスト設計「共通の前提」）:
//  - ネットワークは偽の fetch だけ。無い応答を呼んだらテストを失敗にする
//  - next/navigation は差し替える
//  - localStorage・お気に入り・カートの保存はテストごとに空にする
import "@testing-library/react"; // 先に読み込んでおく
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, vi } from "vitest";
import { cartNotice } from "@/state/cartNotice";
import { cartStore } from "@/state/cart";
import { favoritesStore } from "@/state/favorites";
import { installFakeFetch, resetFakeApi, unexpected } from "./fakeApi";
import { nav, routerPush } from "./navigation";

vi.mock("next/navigation", async () => await import("./navigation"));

beforeEach(() => {
  // jsdom には matchMedia が無い。幅は広い（899px 超）ものとして扱い、動きを減らす設定もしない
  vi.stubGlobal(
    "matchMedia",
    (query: string) => ({ matches: false, media: query, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false }),
  );
  // 大きさの監視（ヘッダーの高さ）も jsdom には無い。何もしない物に置く
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  resetFakeApi();
  installFakeFetch();
  routerPush.mockClear();
  nav.pathname = "/";
  nav.search = "";
});

afterEach(() => {
  cleanup();
  // 保存は singleton（読み出しは最初の 1 回）なので、中身を空に戻してから localStorage を空にする
  for (const id of [...favoritesStore.getSnapshot()]) favoritesStore.remove(id);
  for (const id of Object.keys(cartStore.getSnapshot())) cartStore.remove(id);
  cartNotice.dismiss();
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  const missed = [...unexpected];
  unexpected.length = 0;
  expect(missed, "偽の応答が無い /api/* を呼んだ").toEqual([]);
});
