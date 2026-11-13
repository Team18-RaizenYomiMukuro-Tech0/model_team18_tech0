"use client";

import styles from "./candidates.module.css";

// F3 D-08 D-15: 「共有リンクを作る」ボタン。押せるのは親が disabled=false にしたときだけ（1〜10件で作成中でない）。
// 作成中は「作成中」と出して押せなくする（S-12）。押す場所は 44px 以上（candidates.module.css の .create）。
export function ShareLinkButton({ onCreate, disabled, creating }: Readonly<{ onCreate: () => void; disabled: boolean; creating: boolean }>) {
  return (
    <button type="button" className={styles.create} disabled={disabled || creating} aria-busy={creating} onClick={onCreate}>
      {creating ? "作成中…" : "共有リンクを作る"}
    </button>
  );
}
