"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Q_MAX, cleanQ, parseSearchQuery, searchHref } from "@/lib/searchQuery";

// D-49 SP-35 SP-08 F-46: ヘッダーの検索欄（PC）と虫めがね（スマホ 480px 以下）。
// Enter か検索ボタンで確定する（日本語の変換中の Enter は無視。入力のたびには探さない）。確定すると /search?q=言葉 へ、
// シーン・価格帯・カテゴリー・並び替えはそのまま引き継ぐ（ページは1に戻す）。URL の q は欄に写す。言葉は 50 文字まで。
// スマホは虫めがねを押すとヘッダーの下に入力欄が開き、もう一度押すか「×」で閉じる。
export function HeaderSearch() {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const urlQ = path === "/search" ? cleanQ(params.get("q")) : "";
  const [value, setValue] = useState(urlQ);
  const [seen, setSeen] = useState(urlQ);
  if (seen !== urlQ) {
    // URL の q を欄へ写す（言葉を消した・戻るでも合う）。props が変わったときだけ書き換える形
    setSeen(urlQ);
    setValue(urlQ);
  }
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const mag = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  function submit() {
    const q = cleanQ(value);
    if (!q) return; // 空白だけは今の結果のまま（S-121 ③）
    const cur = path === "/search" ? parseSearchQuery(new URLSearchParams(params.toString())) : parseSearchQuery(new URLSearchParams());
    router.push(searchHref(cur, { q, page: 1, product: null }));
    setOpen(false);
  }
  function close() {
    setOpen(false);
    mag.current?.focus();
  }

  return (
    <>
      <form
        className="hsearch"
        data-open={open}
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          ref={input}
          type="search"
          enterKeyHint="search"
          aria-label="商品名や言葉で探す"
          placeholder="商品名や「甘いもの」で探す"
          maxLength={Q_MAX}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.nativeEvent.isComposing || e.keyCode === 229)) e.preventDefault(); // 変換中の Enter は確定にしない
            if (e.key === "Escape" && open) close();
          }}
        />
        <button type="submit" className="hsgo">
          検索
        </button>
        <button type="button" className="hsclose" aria-label="検索欄を閉じる" onClick={close}>
          <span aria-hidden="true">×</span>
        </button>
      </form>
      <button ref={mag} type="button" className="hbtn hmag" aria-label="検索" aria-expanded={open} onClick={() => (open ? close() : setOpen(true))}>
        <span aria-hidden="true">🔍</span> <span className="t">検索</span>
      </button>
    </>
  );
}
