# search_speed_bench.py — 検索・並び替えの速さを手元で測る（Issue #707。調査用。アプリのコードは変えない）
#
# 使い方（backend の仮想環境で。接続情報は backend/.env から database.py が読む。表示しない）:
#   python evidence/research-1125/search_speed_bench.py real      # 班の DB を SELECT だけで読んで測る（本番と同じ DB。回数は少なめ）
#   python evidence/research-1125/search_speed_bench.py scale     # DB を使わず、手元の架空の行を 1・10・100 倍にして Python の計算を測る
#   python evidence/research-1125/search_speed_bench.py sqlite    # DB を使わず、手元の SQLite に架空の注文を作って「回数の集計」の形を比べる
#
# 約束: DB に書かない（Db.fetch_all は SELECT・SHOW だけ通す。db.py の check_sql）。索引も作らない。EXPLAIN も使わない。
#       接続先・ユーザー・パスワードは出さない。
import os
import random
import sqlite3
import statistics
import sys
import time
from decimal import Decimal
from pathlib import Path

HERE = Path(__file__).resolve()
BACKEND = HERE.parents[2] / "backend"
sys.path.insert(0, str(BACKEND))
for env in (BACKEND / ".env", Path(os.environ.get("GIFTIA_BACKEND_ENV", "")) if os.environ.get("GIFTIA_BACKEND_ENV") else None):
    if env is not None and env.exists():
        from dotenv import load_dotenv

        load_dotenv(env)  # 値は表示しない

SCENE = "送別"


def ms(sec: float) -> float:
    return sec * 1000


def summary(xs: list[float]) -> str:
    xs = sorted(xs)
    return f"中央 {ms(statistics.median(xs)):.1f} ms / 最小 {ms(xs[0]):.1f} / 最大 {ms(xs[-1]):.1f}（{len(xs)} 回）"


def timeit(fn, n: int) -> list[float]:
    out = []
    for _ in range(n):
        t0 = time.perf_counter()
        fn()
        out.append(time.perf_counter() - t0)
    return out


# ───────────── real: 班の DB を SELECT・SHOW だけで読む ─────────────
def real() -> None:
    import db as dbmod
    from api.candidates import SELECT_CANDIDATES, list_candidates
    from api.products import SELECT_PRODUCTS, list_products
    from database import get_connection
    from decision import scene_counts

    print("## 接続を新しく作る時間（暗号化つき。作ってすぐ閉じる）")
    xs = []
    for _ in range(4):
        t0 = time.perf_counter()
        c = get_connection()
        xs.append(time.perf_counter() - t0)
        c.close()
    print(" ", [f"{ms(x):.0f} ms" for x in xs])

    db = dbmod.Db()
    db.fetch_all("SELECT 1 AS x")  # 接続を 1 本残す
    print("\n## 残してある接続での SELECT 1（往復だけ）")
    print(" ", summary(timeit(lambda: db.fetch_all("SELECT 1 AS x"), 20)))

    print("\n## 索引（SHOW INDEX。列の名前だけ）")
    for t in ("orders", "order_items", "products", "product_scenes"):
        rows = db.fetch_all(f"SHOW INDEX FROM {t}")
        by: dict[str, list[str]] = {}
        for r in rows:
            by.setdefault(r["Key_name"], []).append(r["Column_name"])
        print(f"  {t}: {by}")

    print("\n## 行数")
    for t in ("products", "product_scenes", "orders", "order_items"):
        n = db.fetch_all(f"SELECT COUNT(*) AS n FROM {t}")[0]["n"]
        print(f"  {t}: {n}")
    dist = db.fetch_all(
        "SELECT estimated_scene AS s, ship_to_type AS t, COUNT(*) AS n FROM orders GROUP BY estimated_scene, ship_to_type"
    )
    print("  orders の estimated_scene×ship_to_type:", [(r["s"], r["t"], r["n"]) for r in dist])

    print("\n## SQL 単体（候補の SELECT。シーンごと）")
    ids_by_scene: dict[str, list[str]] = {}
    for scene in ("送別", "お礼", "誕生日"):
        p = (scene, 0, 2147483647, 0, *[""] * 10)
        t = timeit(lambda: db.fetch_all(SELECT_CANDIDATES, p), 10)
        rows = db.fetch_all(SELECT_CANDIDATES, p)
        ids_by_scene[scene] = [str(r["product_id"]) for r in rows]
        print(f"  {scene} 価格帯なし: {len(rows)} 行 / {summary(t)}")

    print("\n## SQL 単体（回数の集計 scene_counts。送別）")
    ids = ids_by_scene["送別"]
    for label, sub in (("12 件", ids[:12]), ("上位 24 件", ids[:24]), (f"全候補 {len(ids)} 件", ids)):
        t = timeit(lambda: scene_counts(db, SCENE, sub), 8)
        print(f"  {label}: {summary(t)}")

    print("\n## SQL 単体（products 全件。q 付きの /api/products の最初の SELECT。シーンなし）")
    p = (0, "", 0, 2147483647, 0, *[""] * 10)
    t = timeit(lambda: db.fetch_all(SELECT_PRODUCTS, p), 8)
    print(f"  {len(db.fetch_all(SELECT_PRODUCTS, p))} 行 / {summary(t)}")

    print("\n## 実際の処理（ハンドラーを手元で直接呼ぶ。JSON 化は含まない。残した接続を使う）")
    from starlette.requests import Request
    from starlette.responses import Response

    from clock import get_clock

    last: list = []

    def call(fn, qs: str):
        req = Request({"type": "http", "method": "GET", "path": "/", "query_string": qs.encode(), "headers": []})
        d = dbmod.Db()
        last[:] = [d]
        return fn(req, Response(), d, get_clock())

    cases = [
        ("candidates 送別 おすすめ", list_candidates, "scene=%E9%80%81%E5%88%A5"),
        ("candidates 送別 価格順", list_candidates, "scene=%E9%80%81%E5%88%A5&sort=price_asc"),
        ("candidates 送別 回数順（全候補の集計）", list_candidates, "scene=%E9%80%81%E5%88%A5&sort=scene_count_desc"),
        ("candidates お礼 おすすめ", list_candidates, "scene=%E3%81%8A%E7%A4%BC"),
        ("products 条件なし おすすめ", list_products, ""),
        ("products q=タオル", list_products, "q=%E3%82%BF%E3%82%AA%E3%83%AB"),
        ("products q=タオル 初回後 2 回目以降", list_products, "q=%E3%82%BF%E3%82%AA%E3%83%AB"),
    ]
    for name, fn, qs in cases:
        call(fn, qs)  # ならし（接続・メモリ上の索引）
        t = timeit(lambda: call(fn, qs), 8)
        tm = last[0].timings
        sql = sum(x["sql"] for x in tm) * 1000
        conn = sum(x["connect"] for x in tm) * 1000
        wait = sum(x["wait"] for x in tm) * 1000
        print(
            f"  {name}: {summary(t)} / 最後の 1 回の内訳: DB 呼び出し {len(tm)} 回・SQL {sql:.0f} ms・新規接続 {conn:.0f} ms・待ち {wait:.0f} ms・"
            f"新規 {sum(x['new'] for x in tm):.0f} 本・再利用 {sum(x['reused'] for x in tm):.0f} 本"
        )


# ───────────── scale: Python の計算を 1・10・100 倍で測る（DB なし） ─────────────
def synth_rows(n: int, seed: int = 1) -> list[dict]:
    """架空の商品の行（products と同じ列）。実データではない"""
    rnd = random.Random(seed)
    cats = ["生活雑貨", "食品", "コスメ", "飲料", "家電", "インテリア", "ビジネス小物", "フラワー", "酒類", "カタログギフト"]
    words = ["タオル", "お茶", "コーヒー", "ハンドクリーム", "ワイン", "入浴剤", "カタログ", "スイーツ", "傘", "ペン", "マグカップ", "花束"]
    rows = []
    for i in range(n):
        rc = rnd.choice([0, 0, 3, 8, 20, 60, 150])
        rows.append(
            {
                "product_id": f"G{i + 1:05d}" if i < 99999 else f"G{i + 1}",
                "product_name": f"{rnd.choice(words)} {rnd.choice(['ギフト', 'セット', 'プレミアム', '詰め合わせ'])} {i}",
                "price": rnd.randrange(500, 20000, 100),
                "category": rnd.choice(cats),
                "rating": None if rc == 0 else Decimal(str(round(rnd.uniform(3.0, 5.0), 1))),
                "review_count": rc,
                "delivery_days": rnd.choice([1, 2, 3, 5, 7]),
                "gift_wrap": rnd.choice([0, 1]),
            }
        )
    return rows


def scale() -> None:
    from ranking import candidate_pool, order_by_sort, score_products, top_by_score_then_count
    from search import match, parse_q

    base = 7766  # 班の DB の products の件数（db_schema.md）
    print("## Python の計算（架空の行。1 倍＝7,766 件。シーンで絞らない最大の場合）")
    print("| 倍率 | 件数 | score_products | おすすめ順（pool＋同点処理） | 価格順 | 評価順 | q 検索 初回（索引づくり込み） | q 検索 2 回目以降 |")
    print("| --- | --- | --- | --- | --- | --- | --- | --- |")
    for k in (1, 10, 100):
        rows = synth_rows(base * k)
        items = [(str(r["product_id"]), r["rating"], r["review_count"]) for r in rows]
        items5 = [(str(r["product_id"]), r["price"], r["rating"], r["review_count"], r["delivery_days"]) for r in rows]
        t_score = timeit(lambda: score_products(items), 3)
        scores = score_products(items)

        def rec() -> None:
            pool = candidate_pool(scores, 12)
            top_by_score_then_count(scores, {}, pool, 12)

        t_rec = timeit(rec, 3)
        t_price = timeit(lambda: order_by_sort(items5, "price_asc"), 3)
        t_rate = timeit(lambda: order_by_sort(items5, "rating_desc"), 3)
        words = parse_q("タオル")
        assert isinstance(words, list)
        import search

        search._INDEX.clear()
        t0 = time.perf_counter()
        match(words, rows)
        cold = time.perf_counter() - t0
        warm = timeit(lambda: match(words, rows), 3)
        print(
            f"| ×{k} | {len(rows):,} | {ms(statistics.median(t_score)):.0f} ms | {ms(statistics.median(t_rec)):.0f} ms | "
            f"{ms(statistics.median(t_price)):.0f} ms | {ms(statistics.median(t_rate)):.0f} ms | {ms(cold):.0f} ms | {ms(statistics.median(warm)):.0f} ms |"
        )


# ───────────── sqlite: 回数の集計の形を比べる（手元の架空データ。MySQL とは別物の参考値） ─────────────
def sqlite_bench() -> None:
    rnd = random.Random(7)
    scenes = [("送別", "会社", 0.05), ("送別", "個人", 0.04), ("ビジネスのお礼", "会社", 0.15), ("ビジネスのお礼", "個人", 0.06),
              ("友人への誕生日", "個人", 0.2), ("家族への誕生日", "個人", 0.2), ("毎年決まった相手への贈答", "個人", 0.3)]
    # 比率は仮置き（班の DB の分布は real で出る。ここは形の比較）
    print("## 回数の集計の形（SQLite・手元の架空データ。MySQL の絶対値ではなく、形の比較）")
    print("| 倍率 | 注文数 | 明細数 | 現状 12件 | 現状 全候補 | 案: 索引あり 12件 | 案: 索引あり 全候補 | 案: 集計表 12件 | 案: 集計表 全候補 |")
    print("| --- | --- | --- | --- | --- | --- | --- | --- | --- |")
    for k in (1, 10):  # ×100 は注文 2,700 万行になり手元のメモリ上では重すぎるので省く
        n_orders, n_prod = 277151 * k, 7766 * k
        con = sqlite3.connect(":memory:")
        cur = con.cursor()
        cur.execute("CREATE TABLE orders(order_id TEXT PRIMARY KEY, estimated_scene TEXT, ship_to_type TEXT)")
        cur.execute("CREATE TABLE order_items(order_id TEXT, line_no INT, product_id TEXT, PRIMARY KEY(order_id,line_no))")
        cur.execute("CREATE INDEX ix_oi_product ON order_items(product_id)")  # 班の DB にもある（MUL）
        weights = [w for _, _, w in scenes]
        pick = rnd.choices(scenes, weights=weights, k=n_orders)
        cur.executemany("INSERT INTO orders VALUES(?,?,?)", [(f"O{i}", s, t) for i, (s, t, _) in enumerate(pick)])
        items = []
        for i in range(n_orders):
            items.append((f"O{i}", 1, f"G{rnd.randrange(n_prod)}"))
            if rnd.random() < 0.05:
                items.append((f"O{i}", 2, f"G{rnd.randrange(n_prod)}"))
        cur.executemany("INSERT INTO order_items VALUES(?,?,?)", items)
        con.commit()
        ids_all = [f"G{i}" for i in range(0, n_prod, 4)]  # 送別の候補は商品の約 1/4 と仮定
        ids12 = ids_all[:12]
        q_tpl = (
            "SELECT oi.product_id, COUNT(*) FROM order_items oi JOIN orders o ON o.order_id=oi.order_id "
            "WHERE o.estimated_scene IN (?,?) AND (?=0 OR o.ship_to_type=?) AND oi.product_id IN ({}) GROUP BY oi.product_id"
        )

        def run(ids):  # SQLite は 1 文の変数が少ないので、900 件ずつの文に分けて合計する（MySQL は 1 文で出せる）
            for i in range(0, len(ids), 900):
                part = ids[i : i + 900]
                cur.execute(q_tpl.format(",".join("?" * len(part))), ("送別", "送別", 1, "会社", *part)).fetchall()

        def best(fn, n=3):
            return min(timeit(fn, n))

        base12, baseall = best(lambda: run(ids12)), best(lambda: run(ids_all))
        cur.execute("CREATE INDEX ix_o_scene ON orders(estimated_scene, ship_to_type)")
        idx12, idxall = best(lambda: run(ids12)), best(lambda: run(ids_all))
        cur.execute("CREATE TABLE scene_count(product_id TEXT, scene TEXT, n INT, PRIMARY KEY(scene, product_id))")
        cur.execute(
            "INSERT INTO scene_count SELECT oi.product_id, '送別', COUNT(*) FROM order_items oi JOIN orders o ON o.order_id=oi.order_id "
            "WHERE o.estimated_scene='送別' AND o.ship_to_type='会社' GROUP BY oi.product_id"
        )

        def run2(ids):
            for i in range(0, len(ids), 900):
                part = ids[i : i + 900]
                cur.execute(f"SELECT product_id, n FROM scene_count WHERE scene=? AND product_id IN ({','.join('?' * len(part))})", ("送別", *part)).fetchall()

        s12, sall = best(lambda: run2(ids12)), best(lambda: run2(ids_all))
        print(
            f"| ×{k} | {n_orders:,} | {len(items):,} | {ms(base12):.1f} ms | {ms(baseall):.0f} ms | {ms(idx12):.1f} ms | {ms(idxall):.0f} ms | {ms(s12):.2f} ms | {ms(sall):.1f} ms |"
        )
        con.close()


if __name__ == "__main__":
    {"real": real, "scale": scale, "sqlite": sqlite_bench}[sys.argv[1]]()
