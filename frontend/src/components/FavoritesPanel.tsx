"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { arrivesText, canCompare, canSelectMore, compareLabel, NOTFOUND_MESSAGE, pruneSelection, ratingCell, toggleSelect, UNDER_TWO_MESSAGE, wrappingText } from "@/lib/compare";
import { formatPrice } from "@/lib/formatPrice";
import { productImage } from "@/lib/images";
import { fetchJson, isProductDetail, productUrl, type Fetched, type ProductDetail } from "@/lib/products";
import { buildSearchHref } from "@/lib/topPage";
import { cartStore } from "@/state/cart";
import { FAVORITES_KEY, loadFavorites, useFavorites } from "@/state/favorites";
import { Icon } from "./icons";
import styles from "./favorites.module.css";

// D-30 SP-13 #46-6: ヘッダーのお気に入りのボタンと、右から出る一覧のパネル。
// パネルを開くたびに、登録済みの商品IDから D-29 で名前・価格・在庫を取る。「外す」で解除するとハートも同期して未登録になる。
// 第2弾: 各行に「カートに入れる」（SP-18。D-31 と同じ追加・通知。在庫なしは押せない。404 の行には置かない）と商品名のリンク（パネルを閉じて /search?product=）、
// 「比べる」の選択と比べる表（SP-23 D-47。選ぶ規則と各項目の文字は lib/compare.ts。選択は保存せず、パネルを閉じたら外れる）。
export function FavoritesButton() {
  const [open, setOpen] = useState(false);
  const { ids } = useFavorites();
  const btn = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={btn}
        type="button"
        className="hbtn"
        aria-label="お気に入り"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="ico"><Icon name="heart" /></span> <span className="t">お気に入り</span>
        {ids.length > 0 && <span className={`${styles.count} cnt`}>{ids.length}</span>}
      </button>
      {open && (
        <FavoritesPanel
          onClose={() => {
            setOpen(false);
            btn.current?.focus();
          }}
        />
      )}
    </>
  );
}

type Got = Fetched<ProductDetail>;
const fetchDetail = (id: string): Promise<Got> => fetchJson(productUrl(id), isProductDetail);

function FavoritesPanel({ onClose }: Readonly<{ onClose: () => void }>) {
  const { ids, remove } = useFavorites();
  const [found, setFound] = useState<Record<string, Got>>({});
  const [picked, setPicked] = useState<string[]>([]);
  const [view, setView] = useState<"list" | "table">("list");
  const [cmp, setCmp] = useState<Record<string, Got | undefined>>({});
  const [gone, setGone] = useState<string[]>([]); // 表を開いている間に、ほかのタブで外れた商品
  const wasTable = useRef(false);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const cmpBtn = useRef<HTMLButtonElement>(null);
  const backBtn = useRef<HTMLButtonElement>(null);

  // 開いたときに名前・価格・在庫を取る（まだ取っていない商品だけ）
  useEffect(() => {
    let alive = true;
    for (const id of ids) {
      if (found[id]) continue;
      fetchDetail(id).then((r) => alive && setFound((f) => ({ ...f, [id]: r })));
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- found を入れると取得のたびに再実行して重複して取る
  }, [ids]);

  // 一覧で外した商品は選択からも外れる（SP-23）
  const selected = pruneSelection(picked, ids);
  // 別のタブでお気に入りが外れたら、その列を消す（SP-23 ⑧）
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== FAVORITES_KEY) return;
      const now = loadFavorites(window.localStorage);
      setGone((g) => [...g, ...selected.filter((x) => !now.includes(x) && !g.includes(x))]);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [selected]);

  const columns = selected.filter((id) => !gone.includes(id) && cmp[id]?.status !== "notfound");
  const loading = view === "table" && selected.some((id) => !cmp[id]);
  const failed = view === "table" && selected.some((id) => cmp[id]?.status === "error");
  const missing = selected.some((id) => cmp[id]?.status === "notfound");
  // 表の列が 2 件未満になったら表は出さず一覧へ戻る（外れた列は消し、見つからない商品は除く）
  const bounced = view === "table" && !loading && !failed && !canCompare(columns.length);
  const showTable = view === "table" && !bounced;
  const notice = bounced ? (gone.length === 0 && missing ? NOTFOUND_MESSAGE : UNDER_TWO_MESSAGE) : "";
  const backToList = () => setView("list");

  const openTable = () => {
    setGone([]);
    setCmp({});
    setView("table");
    load(selected);
  };
  const load = (list: readonly string[]) => {
    for (const id of list) {
      setCmp((c) => ({ ...c, [id]: undefined }));
      fetchDetail(id).then((r) => setCmp((c) => ({ ...c, [id]: r })));
    }
  };
  // 表を開いたら「← お気に入りにもどる」へ、一覧へ戻ったら「比べる」ボタンへフォーカス（SP-23）
  useEffect(() => {
    if (showTable) {
      wasTable.current = true;
      backBtn.current?.focus();
    } else if (wasTable.current) {
      wasTable.current = false;
      cmpBtn.current?.focus();
    }
  }, [showTable]);

  useEffect(() => {
    closeBtn.current?.focus();
  }, []);
  // Esc: 表のときは一覧に戻る（パネルは閉じない）。それ以外はパネルを閉じる
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (showTable) backToList();
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, showTable]);

  const more = canSelectMore(selected);
  return (
    <div className={styles.overlay} onClick={onClose}>
      <aside className={`${styles.panel} ${showTable ? styles.panelWide : ""}`} role="dialog" aria-label="お気に入り" onClick={(e) => e.stopPropagation()}>
        <div className={styles.head}>
          <b>お気に入り（{ids.length}件）</b>
          <button ref={closeBtn} type="button" className={styles.close} onClick={onClose}>
            閉じる
          </button>
        </div>
        {showTable ? (
          <CompareTable
            backRef={backBtn}
            loading={loading}
            failed={failed}
            missing={missing}
            columns={columns}
            data={cmp}
            onBack={backToList}
            onRetry={() => load(selected.filter((id) => cmp[id]?.status === "error"))}
            onLink={onClose}
          />
        ) : ids.length === 0 ? (
          <p className={styles.empty}>まだ登録した商品はありません。</p>
        ) : (
          <>
            <button ref={cmpBtn} type="button" className={styles.compare} disabled={!canCompare(selected.length)} onClick={openTable}>
              {compareLabel(selected.length)}
            </button>
            <p role="status" className={styles.note}>
              {notice || (selected.length === 1 ? "2〜3件選ぶと比べられます" : "")}
            </p>
            <ul className={styles.list}>
              {ids.map((id) => {
                const r = found[id];
                const p = r?.status === "ok" ? r.data : null;
                const checked = selected.includes(id);
                return (
                  <li key={id}>
                    <label className={styles.pick}>
                      <input type="checkbox" checked={checked} disabled={!checked && !more} onChange={() => {
                          setView("list");
                          setPicked(toggleSelect(selected, id));
                        }} />
                      <span>比べる</span>
                      <span className={styles.sr}>{p ? `：${p.name}` : ""}</span>
                    </label>
                    <span className={styles.nm}>
                      {!r ? (
                        "読み込み中…"
                      ) : p ? (
                        <Link href={buildSearchHref({ productId: id })} onClick={onClose}>
                          {p.name}
                        </Link>
                      ) : r.status === "notfound" ? (
                        "この商品は見つかりません"
                      ) : (
                        "商品の情報を読み込めませんでした"
                      )}
                    </span>
                    {p && <span>{formatPrice(p.price)}</span>}
                    {p && <CartAdd id={id} outOfStock={p.status === "out_of_stock"} />}
                    <button type="button" className={styles.unfav} aria-label={p ? `${p.name}を外す` : "外す"} onClick={() => remove(id)}>
                      外す
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </aside>
    </div>
  );
}

// 「カートに入れる」（D-31 と同じ追加・通知）。在庫なし（out_of_stock）は「在庫なし」で押せない（SP-18）
function CartAdd({ id, outOfStock, full = false }: Readonly<{ id: string; outOfStock: boolean; full?: boolean }>) {
  return (
    <button type="button" className={full ? `${styles.cartAdd} ${styles.cartFull}` : styles.cartAdd} disabled={outOfStock} onClick={() => cartStore.add(id)}>
      {outOfStock ? "在庫なし" : "カートに入れる"}
    </button>
  );
}

const ROWS: { label: string; cell: (p: ProductDetail) => string }[] = [
  { label: "価格（税込）", cell: (p) => formatPrice(p.price) },
  { label: "届く日（目安）", cell: (p) => arrivesText(p.arrives_on) },
  { label: "ラッピング", cell: (p) => wrappingText(p.wrapping) },
  { label: "評価（件数）", cell: (p) => ratingCell(p.rating, p.review_count) },
];

// 比べる表（SP-23 D-47）。列＝商品、行＝価格・届く日・ラッピング・評価。表の中ではお気に入りを外せない。収まらない幅は表の中だけ横に動く
function CompareTable({
  backRef, loading, failed, missing, columns, data, onBack, onRetry, onLink,
}: Readonly<{
  backRef: React.RefObject<HTMLButtonElement | null>;
  loading: boolean; failed: boolean; missing: boolean;
  columns: string[]; data: Record<string, Got | undefined>;
  onBack: () => void; onRetry: () => void; onLink: () => void;
}>) {
  const items = columns.map((id) => ({ id, p: data[id]?.status === "ok" ? (data[id] as { status: "ok"; data: ProductDetail }).data : null }));
  return (
    <div>
      <button ref={backRef} type="button" className={styles.back} onClick={onBack}>
        ← お気に入りにもどる
      </button>
      {loading && <p role="status" className={styles.note}>読み込み中</p>}
      {failed && !loading && (
        <p role="alert" className={styles.note}>
          比べる商品を読み込めませんでした{" "}
          <button type="button" className={styles.close} onClick={onRetry}>
            もう一度
          </button>
        </p>
      )}
      {!loading && !failed && missing && <p role="status" className={styles.note}>{NOTFOUND_MESSAGE}</p>}
      {!loading && !failed && (
        <div className={styles.scroll} role="region" aria-label="比べる表" tabIndex={0}>
          <table className={styles.table}>
            <thead>
              <tr>
                <td />
                {items.map(({ id, p }) => (
                  <th key={id} scope="col">
                    {p && productImage(p.category) && (
                      // eslint-disable-next-line @next/next/no-img-element -- カテゴリー共通の静的イラスト
                      <img src={productImage(p.category) ?? ""} alt="" width={48} height={48} />
                    )}
                    {p && (
                      <Link href={buildSearchHref({ productId: id })} onClick={onLink}>
                        {p.name}
                      </Link>
                    )}
                    {p?.status === "out_of_stock" && <span className={styles.stockout}>在庫なし</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.label}>
                  <th scope="row">{r.label}</th>
                  {items.map(({ id, p }) => (
                    <td key={id}>{p ? r.cell(p) : "—"}</td>
                  ))}
                </tr>
              ))}
              <tr>
                <td />
                {items.map(({ id, p }) => (
                  <td key={id}>{p && <CartAdd id={id} outOfStock={p.status === "out_of_stock"} full />}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
