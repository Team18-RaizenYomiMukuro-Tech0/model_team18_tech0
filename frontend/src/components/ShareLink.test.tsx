import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ShareLink } from "@/lib/api";
import { ShareLinkButton } from "./ShareLinkButton";
import { ShareLinkResult } from "./ShareLinkResult";

const link = (id: string): ShareLink => ({ share_id: id, path: `/shared/${id}`, created_at: "2026-11-25T00:00:00+09:00", expires_at: "2026-12-25T00:00:00+09:00" });

describe("V-19 ShareLinkButton", () => {
  it("V-19 作るボタン: 通常は押すと呼ばれ、作成中は「作成中…」（aria-busy）で押せない。disabled も押せない", () => {
    const onCreate = vi.fn();
    const { rerender } = render(<ShareLinkButton onCreate={onCreate} disabled={false} creating={false} />);
    fireEvent.click(screen.getByRole("button", { name: "共有リストを作る" }));
    expect(onCreate).toHaveBeenCalledTimes(1);

    rerender(<ShareLinkButton onCreate={onCreate} disabled={false} creating={true} />);
    const busy = screen.getByRole("button", { name: "作成中…" }) as HTMLButtonElement;
    expect(busy.getAttribute("aria-busy")).toBe("true");
    expect(busy.disabled).toBe(true);
    fireEvent.click(busy);

    rerender(<ShareLinkButton onCreate={onCreate} disabled={true} creating={false} />);
    const off = screen.getByRole("button", { name: "共有リストを作る" }) as HTMLButtonElement;
    expect(off.disabled).toBe(true);
    fireEvent.click(off);
    expect(onCreate).toHaveBeenCalledTimes(1);
  });
});

describe("V-20 ShareLinkResult", () => {
  it("V-20 結果: リンクとコピー（押すと結果が出る。新しいリンクで消える）。失敗は「再試行」で呼ばれる", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    const { rerender } = render(<ShareLinkResult link={link("aaa")} failed={false} onRetry={() => {}} />);
    expect(screen.getByText(`${window.location.origin}/shared/aaa`)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "コピー" }));
    expect(await screen.findByText("コピーしました")).toBeTruthy();
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/shared/aaa`);

    rerender(<ShareLinkResult link={link("bbb")} failed={false} onRetry={() => {}} />);
    await waitFor(() => expect(screen.queryByText("コピーしました")).toBeNull());
    expect(screen.getByText(`${window.location.origin}/shared/bbb`)).toBeTruthy();

    const onRetry = vi.fn();
    rerender(<ShareLinkResult link={null} failed={true} onRetry={onRetry} />);
    expect(screen.getByText(/失敗しました。もう一度お試しください/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "再試行" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
