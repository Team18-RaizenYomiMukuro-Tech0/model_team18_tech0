// D-31 D-10 SP-14 ③④ U-57 U-58: カートの通知（「カートに入れました」「カートを読み込めなかったため、空にしました」）。
// 約3秒で消える。マウスやフォーカスが通知にある間は消さない（離れたら3秒を数え直す）。タイマーは global の setTimeout を使う。

export const NOTICE_MS = 3000;
export const ADDED_MESSAGE = "カートに入れました";
export const CORRUPT_MESSAGE = "カートを読み込めなかったため、空にしました";

export type NoticeKind = "added" | "corrupt";
export type Notice = { kind: NoticeKind; seq: number } | null;

export class NoticeController {
  private notice: Notice = null;
  private seq = 0;
  private holds = 0; // マウス・フォーカスが通知にある数
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly listeners = new Set<() => void>();

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => void this.listeners.delete(cb);
  };

  getSnapshot = (): Notice => this.notice;

  show(kind: NoticeKind): void {
    this.notice = { kind, seq: ++this.seq }; // 続けて出したら、新しい通知に置き換えて3秒を数え直す
    this.holds = 0;
    this.restart();
    this.emit();
  }

  hold(): void {
    if (!this.notice) return;
    this.holds++;
    this.clear();
  }

  release(): void {
    if (!this.notice || this.holds === 0) return;
    this.holds--;
    if (this.holds === 0) this.restart();
  }

  dismiss(): void {
    if (!this.notice) return;
    this.clear();
    this.holds = 0;
    this.notice = null;
    this.emit();
  }

  private restart(): void {
    this.clear();
    this.timer = setTimeout(() => this.dismiss(), NOTICE_MS);
  }

  private clear(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private emit(): void {
    this.listeners.forEach((l) => l());
  }
}

export const cartNotice = new NoticeController();
