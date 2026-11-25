// next/navigation の差し替え（テスト設計「共通の前提」）。押した先は routerPush の引数で確かめる。
import { vi } from "vitest";

export const routerPush = vi.fn();
export const nav = { pathname: "/", search: "" };

export const useRouter = () => ({ push: routerPush, replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() });
export const usePathname = () => nav.pathname;
export const useSearchParams = () => new URLSearchParams(nav.search);
