// F3 D-08 #32-6 S-32 S-33 S-41: コピーボタンの動き（React を使わない純粋な部分）。
// 成功:「コピーしました」を2秒表示して消す。表示中に再び押したら、コピーし直して2秒を数え直す（前のタイマーは止める）。
// 失敗: 文言を、次にボタンを押す（または新しいリンクを作る）まで残す（設計案）。どちらでもリンクは表示したまま。
export const COPIED_MESSAGE = "コピーしました";
export const COPY_FAILED_MESSAGE = "コピーできませんでした。リンクを長押ししてコピーしてください";
export const COPIED_SHOW_MS = 2000;

export type CopyStatus = "idle" | "copied" | "failed";
type Writer = (text: string) => Promise<void>;

export class CopyController {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private seq = 0;
  private readonly onChange: (s: CopyStatus) => void;
  private readonly write: Writer;

  constructor(onChange: (s: CopyStatus) => void, write: Writer = (t) => navigator.clipboard.writeText(t)) {
    this.onChange = onChange;
    this.write = write;
  }

  async copy(text: string): Promise<void> {
    const mine = ++this.seq;
    this.clearTimer();
    let ok = true;
    try {
      await this.write(text); // クリップボードを使えない環境では同期で例外になることもある
    } catch {
      ok = false;
    }
    if (mine !== this.seq) return; // もっと新しい押下がある
    this.onChange(ok ? "copied" : "failed");
    if (ok) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.onChange("idle");
      }, COPIED_SHOW_MS);
    }
  }

  // 新しいリンクに置き換わったとき・画面を離れるとき
  reset(): void {
    this.seq++;
    this.clearTimer();
    this.onChange("idle");
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
