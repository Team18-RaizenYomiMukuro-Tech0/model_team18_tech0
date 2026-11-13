"use client";

import { useEffect, useRef, useState } from "react";
import { shareFullUrl, SHARE_FAILED_MESSAGE, type ShareLink } from "@/lib/api";
import { CopyController, COPIED_MESSAGE, COPY_FAILED_MESSAGE, type CopyStatus } from "@/lib/copyButton";
import styles from "./candidates.module.css";

// F3 D-08 #32-6 #41-1: できたリンク（選べる文字）とコピーボタン、コピーの結果、作成の失敗と再試行。
// link は最新の1本だけ。新しいリンクに置き換わったらコピーの結果は消す。
export function ShareLinkResult({ link, failed, onRetry }: Readonly<{ link: ShareLink | null; failed: boolean; onRetry: () => void }>) {
  const [copy, setCopy] = useState<CopyStatus>("idle");
  const ctl = useRef<CopyController | null>(null);
  useEffect(() => {
    const c = new CopyController(setCopy);
    ctl.current = c;
    return () => c.reset();
  }, []);
  const id = link?.share_id;
  useEffect(() => ctl.current?.reset(), [id]);

  const url = link ? shareFullUrl(window.location.origin, link.path) : "";
  return (
    <div className={styles.share}>
      {failed && (
        <p className={styles.over} role="alert">
          {SHARE_FAILED_MESSAGE}
          <button type="button" className={styles.remove} onClick={onRetry}>
            再試行
          </button>
        </p>
      )}
      {link && (
        <div className={styles.sharelink}>
          <a className={styles.url} href={url}>
            {url}
          </a>
          <button type="button" className={styles.remove} onClick={() => ctl.current?.copy(url)}>
            コピー
          </button>
          <span role="status" className={styles.copymsg}>
            {copy === "copied" ? COPIED_MESSAGE : copy === "failed" ? COPY_FAILED_MESSAGE : ""}
          </span>
        </div>
      )}
    </div>
  );
}
