# measure_cache.py — D-04 をメモリに置く案（ADR-023・設計 D-50）の未決 ①②③ を手元で測る（Issue #713 の続き）
#
# 使い方（backend の仮想環境で。接続情報は GIFTIA_BACKEND_ENV の .env から読む。表示しない）:
#   GIFTIA_BACKEND_ENV=<.env のパス> backend/.venv/bin/python evidence/cache-plan-1125/measure_cache.py db      # ①② 班の DB へ SELECT だけ
#   GIFTIA_BACKEND_ENV=<.env のパス> backend/.venv/bin/python evidence/cache-plan-1125/measure_cache.py memory  # ③ メモリの使用量（DB から読んだ行を置く）
#
# 約束: DB に書かない（Db.fetch_all は SELECT・SHOW だけ通す。db.py の check_sql）。索引も作らない。EXPLAIN も使わない。
#       接続先・ユーザー・パスワードは出さない。アプリのコードは変えない（import して使うだけ）。
import gc
import os
import resource
import statistics
import sys
import time
import tracemalloc
from pathlib import Path

HERE = Path(__file__).resolve()
BACKEND = HERE.parents[2] / "backend"
sys.path.insert(0, str(BACKEND))
if os.environ.get("GIFTIA_BACKEND_ENV"):
    from dotenv import load_dotenv

    load_dotenv(os.environ["GIFTIA_BACKEND_ENV"])  # 値は表示しない

# ① 回数の一括集計（D-50 の「回数の一括」。3 シーンぶんを 1 本で数える形）。
#    送別だけ「会社宛て」に限る（SP-16）ので ship_to_type も束ねて返し、Python 側でシーンごとに足す。
SQL_COUNTS = (
    "SELECT oi.product_id AS product_id, o.estimated_scene AS scene, o.ship_to_type AS ship_to, COUNT(*) AS n "
    "FROM order_items oi JOIN orders o ON o.order_id = oi.order_id "
    "WHERE o.estimated_scene IN (%s, %s, %s, %s) "
    "GROUP BY oi.product_id, o.estimated_scene, o.ship_to_type"
)
COUNT_PARAMS = ("送別", "ビジネスのお礼", "友人への誕生日", "家族への誕生日")

# ② 商品の全件読み込み（D-50 の「商品の行」。api/products.py の SELECT_PRODUCTS と同じ列・同じ在庫条件で、絞り込みを外した形）
SQL_PRODUCTS = (
    "SELECT p.product_id, p.product_name, p.price, p.category, p.rating, p.review_count, p.delivery_days, p.gift_wrap "
    "FROM products p WHERE p.stock >= 1"
)
SQL_SCENES = "SELECT s.product_id, s.scene_tag FROM product_scenes s"


def wrap_count(sql: str) -> str:
    """行を運ばず、DB の中で実行させて 1 行だけ返す形（サーバーでかかる時間を、転送と分けて見るため）"""
    return f"SELECT COUNT(*) AS c FROM ({sql}) t"


def ms(x: float) -> float:
    return x * 1000


def second_slowest(xs: list[float]) -> float:
    return sorted(xs)[-2]


def stat(xs: list[float]) -> str:
    return (
        f"中央 {ms(statistics.median(xs)):,.0f} ms / 最小 {ms(min(xs)):,.0f} / 最大 {ms(max(xs)):,.0f} / "
        f"遅い方から2番目 {ms(second_slowest(xs)):,.0f}（{len(xs)} 回）"
    )


def timeit(fn, n: int) -> list[float]:
    out = []
    for _ in range(n):
        t0 = time.perf_counter()
        fn()
        out.append(time.perf_counter() - t0)
    return out


def db_part() -> None:
    import db as dbmod
    from database import get_connection

    N = 10
    db = dbmod.Db()
    db.fetch_all("SELECT 1 AS x")  # 接続を 1 本残す
    rtt = timeit(lambda: db.fetch_all("SELECT 1 AS x"), 20)
    print(f"## 往復（残した接続で SELECT 1）: {stat(rtt)}")

    conn_t = []
    for _ in range(N):
        t0 = time.perf_counter()
        c = get_connection()
        conn_t.append(time.perf_counter() - t0)
        c.close()
    print(f"## 接続を新しく作る（暗号化つき）: {stat(conn_t)}")

    # 件数の確認（実測の行数）
    rows_p = db.fetch_all(SQL_PRODUCTS)
    rows_s = db.fetch_all(SQL_SCENES)
    print(f"\n## 行数: products(stock>=1) {len(rows_p):,} 行 / product_scenes {len(rows_s):,} 行")

    # ① まず 1 回だけ測り、10 秒に近ければ繰り返さない（本番・班の DB に負荷をかけすぎないため）
    t0 = time.perf_counter()
    try:
        rows_c = db.fetch_all(SQL_COUNTS, COUNT_PARAMS)
    except Exception as e:  # 10 秒の打ち切りなど
        print(f"\n## ① 1 回目で失敗: {type(e).__name__}。繰り返さない")
        return
    first = time.perf_counter() - t0
    print(f"\n## ① 回数の一括集計: 1 回目 {ms(first):,.0f} ms / {len(rows_c):,} 行が返る")
    if first > 6.0:
        print("   （6 秒を超えたので、繰り返しは 3 回に減らす）")
    n1 = 3 if first > 6.0 else N
    t = [first] + timeit(lambda: db.fetch_all(SQL_COUNTS, COUNT_PARAMS), n1 - 1)
    print(f"   ① 全部運ぶ（Db.fetch_all。10 秒の上限つき）: {stat(t)}")
    tw = timeit(lambda: db.fetch_all(wrap_count(SQL_COUNTS), COUNT_PARAMS), min(n1, 5))
    print(f"   ① 運ばず DB の中だけ（COUNT で包む）: {stat(tw)}")

    # ② 商品の全件
    for label, sql in (("products 全件（在庫1以上）", SQL_PRODUCTS), ("product_scenes 全件", SQL_SCENES)):
        t = timeit(lambda: db.fetch_all(sql), N)
        tw = timeit(lambda: db.fetch_all(wrap_count(sql)), N)
        print(f"\n## ② {label}\n   全部運ぶ: {stat(t)}\n   運ばず DB の中だけ: {stat(tw)}")

    def both() -> None:
        db.fetch_all(SQL_PRODUCTS)
        db.fetch_all(SQL_SCENES)

    t = timeit(both, N)
    print(f"\n## ② products ＋ product_scenes（2 本を続けて）: {stat(t)}")

    # 起動したての 1 回（接続を新しく作る＋商品2本＋回数1本。いま D-50 が想定する「空の間の最初の要求」）
    def cold() -> None:
        d = dbmod.Db()  # 新しい Db（残した接続が無い）
        d.fetch_all(SQL_PRODUCTS)
        d.fetch_all(SQL_SCENES)
        d.fetch_all(SQL_COUNTS, COUNT_PARAMS)

    n_cold = 3 if first > 4.0 else 5
    t = timeit(cold, n_cold)
    print(f"\n## 起動したての 1 回ぶん（新しい接続＋商品2本＋回数1本）: {stat(t)}")


def cpu_part() -> None:
    """手元の CPU 時間（process_time）だけを測る。ネットワークの待ちを含まないので、行を読んで dict にする Python 側の仕事の量が分かる。
    本番で往復が短くなっても残るのは、この分と、DB の中の時間（db の COUNT で包んだ値）"""
    import db as dbmod

    db = dbmod.Db()
    db.fetch_all("SELECT 1 AS x")
    for label, sql, params in (
        ("① 回数の一括", SQL_COUNTS, COUNT_PARAMS),
        ("② products 全件", SQL_PRODUCTS, ()),
        ("② product_scenes 全件", SQL_SCENES, ()),
    ):
        cpu, wall = [], []
        for _ in range(5):
            c0, w0 = time.process_time(), time.perf_counter()
            db.fetch_all(sql, params)
            cpu.append(time.process_time() - c0)
            wall.append(time.perf_counter() - w0)
        print(f"{label}: CPU 時間 {stat(cpu)} / 経過 {stat(wall)}")


def rss_mb() -> float:
    # macOS は ru_maxrss がバイト、Linux は KB
    v = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return v / 1024 / 1024 if sys.platform == "darwin" else v / 1024


def cur_rss_mb() -> float:
    import subprocess

    out = subprocess.run(["ps", "-o", "rss=", "-p", str(os.getpid())], capture_output=True, text=True).stdout.strip()
    return int(out) / 1024


def build_container(rows_p, rows_s, rows_c):
    """D-50 の入れ物のつもりの形: 商品 dict（product_id → 行 dict）、商品→シーンの集合、商品→{シーン: 回数}。生の scenes・counts の行は持たない"""
    products = {str(r["product_id"]): r for r in rows_p}
    scenes: dict[str, set[str]] = {}
    for r in rows_s:
        scenes.setdefault(str(r["product_id"]), set()).add(r["scene_tag"])
    counts: dict[str, dict[str, int]] = {}
    for r in rows_c:
        pid, sc = str(r["product_id"]), r["scene"]
        key = "送別" if sc == "送別" else ("お礼" if sc == "ビジネスのお礼" else "誕生日")
        if key == "送別" and r["ship_to"] != "会社":
            continue
        d = counts.setdefault(pid, {})
        d[key] = d.get(key, 0) + int(r["n"])
    return products, scenes, counts


# ①b 回数の一括集計の別の書き方（商品ごとに 1 行。シーンは SUM(CASE) で分ける）。返る行数が少なく、Python で足し算しなくてよい
SQL_COUNTS_B = (
    "SELECT oi.product_id AS product_id, "
    "SUM(CASE WHEN o.estimated_scene = %s AND o.ship_to_type = %s THEN 1 ELSE 0 END) AS sendoff, "
    "SUM(CASE WHEN o.estimated_scene = %s THEN 1 ELSE 0 END) AS thanks, "
    "SUM(CASE WHEN o.estimated_scene IN (%s, %s) THEN 1 ELSE 0 END) AS birthday "
    "FROM order_items oi JOIN orders o ON o.order_id = oi.order_id "
    "WHERE o.estimated_scene IN (%s, %s, %s, %s) "
    "GROUP BY oi.product_id"
)
COUNT_PARAMS_B = ("送別", "会社", "ビジネスのお礼", "友人への誕生日", "家族への誕生日", *COUNT_PARAMS)


def variant_part() -> None:
    import db as dbmod

    db = dbmod.Db()
    db.fetch_all("SELECT 1 AS x")
    a = db.fetch_all(SQL_COUNTS, COUNT_PARAMS)
    b = db.fetch_all(SQL_COUNTS_B, COUNT_PARAMS_B)
    # 同じ結果になるかを確かめる（商品×シーンの回数が一致するか）
    ma: dict[tuple[str, str], int] = {}
    for r in a:
        k = "送別" if r["scene"] == "送別" else ("お礼" if r["scene"] == "ビジネスのお礼" else "誕生日")
        if k == "送別" and r["ship_to"] != "会社":
            continue
        ma[(str(r["product_id"]), k)] = ma.get((str(r["product_id"]), k), 0) + int(r["n"])
    mb = {}
    for r in b:
        for k, col in (("送別", "sendoff"), ("お礼", "thanks"), ("誕生日", "birthday")):
            if int(r[col]):
                mb[(str(r["product_id"]), k)] = int(r[col])
    print(f"①b の行数 {len(b):,}（①は {len(a):,}）。商品×シーンの回数の一致: {ma == mb}（{len(ma):,} 組）")
    t = timeit(lambda: db.fetch_all(SQL_COUNTS_B, COUNT_PARAMS_B), 10)
    print(f"①b 全部運ぶ: {stat(t)}")

    def cold_b() -> None:
        d = dbmod.Db()  # 新しい Db（残した接続が無い）
        d.fetch_all(SQL_PRODUCTS)
        d.fetch_all(SQL_SCENES)
        d.fetch_all(SQL_COUNTS_B, COUNT_PARAMS_B)

    print(f"起動したての 1 回ぶん（新しい接続＋商品2本＋回数 ①b）: {stat(timeit(cold_b, 5))}")
    tw = timeit(lambda: db.fetch_all(wrap_count(SQL_COUNTS_B), COUNT_PARAMS_B), 5)
    print(f"①b 運ばず DB の中だけ: {stat(tw)}")


def rss_part() -> None:
    """新しいプロセスで、読み込みの前後の RSS（OS から見たメモリ）と最大値を測る。読み直し（2 回目の読み込み）も含む"""
    import db as dbmod

    db = dbmod.Db()
    db.fetch_all("SELECT 1 AS x")
    gc.collect()
    print(f"読み込み前 RSS: {cur_rss_mb():.1f} MB")
    c1 = build_container(db.fetch_all(SQL_PRODUCTS), db.fetch_all(SQL_SCENES), db.fetch_all(SQL_COUNTS, COUNT_PARAMS))
    db.fetch_all("SELECT 1 AS x")
    gc.collect()
    print(f"1 回目の読み込み後 RSS: {cur_rss_mb():.1f} MB（最大 {rss_mb():.1f} MB）")
    c2 = build_container(db.fetch_all(SQL_PRODUCTS), db.fetch_all(SQL_SCENES), db.fetch_all(SQL_COUNTS, COUNT_PARAMS))
    print(f"読み直し中（古い入れ物と新しい入れ物が両方ある）RSS: {cur_rss_mb():.1f} MB（最大 {rss_mb():.1f} MB）")
    del c1
    db.fetch_all("SELECT 1 AS x")
    gc.collect()
    print(f"古い入れ物を捨てた後 RSS: {cur_rss_mb():.1f} MB（最大 {rss_mb():.1f} MB）")
    _ = c2


def memory_part() -> None:
    import db as dbmod

    db = dbmod.Db()
    gc.collect()
    print(f"読み込み前の RSS（Python・pymysql・この測定の道具だけ）: {cur_rss_mb():.1f} MB")

    # 1) 定常: 入れ物だけが残ったときの大きさ（tracemalloc。start の後に確保した分だけ数える）
    tracemalloc.start()
    rows_p = db.fetch_all(SQL_PRODUCTS)
    rows_s = db.fetch_all(SQL_SCENES)
    rows_c = db.fetch_all(SQL_COUNTS, COUNT_PARAMS)
    _, peak_fetch = tracemalloc.get_traced_memory()
    container = build_container(rows_p, rows_s, rows_c)
    n_p, n_s, n_c = len(rows_p), len(rows_s), len(rows_c)
    del rows_s, rows_c  # 生の行は捨てる（products の行は入れ物が持ち続ける）
    db.fetch_all("SELECT 1 AS x")  # 接続が直前の結果（回数の行）を持ち続けるので、軽い問い合わせで置き換えてから数える
    gc.collect()
    steady, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    print(f"行数: products {n_p:,} / product_scenes {n_s:,} / 回数の行 {n_c:,}")
    print(f"## 定常（入れ物だけ。products の行は dict のまま持つ形）: 約 {steady / 1e6:.1f} MB")
    print(f"## 読み込み中の山（生の行と入れ物が同時にある。1 回ぶん）: 約 {peak / 1e6:.1f} MB")
    print(f"   読み直し中は、古い入れ物（約 {steady / 1e6:.1f} MB）がまだ残るので、山の上に古い分が乗る: 約 {(peak + steady) / 1e6:.1f} MB")

    # 3) 件数を増やしたとき（実データの行を複製。形を比べるだけ）
    products, scenes, counts = container
    print("\n## 件数を増やしたとき（実データの行を複製して並べる。実データではない。入れ物のみ）")
    for k in (1, 10):
        tracemalloc.start()
        big_p = {f"{pid}_{i}": dict(r) for i in range(k) for pid, r in products.items()}
        big_s = {f"{pid}_{i}": set(v) for i in range(k) for pid, v in scenes.items()}
        big_c = {f"{pid}_{i}": dict(v) for i in range(k) for pid, v in counts.items()}
        cur_k, _ = tracemalloc.get_traced_memory()
        tracemalloc.stop()
        print(f"   ×{k}（{len(big_p):,} 件）: 約 {cur_k / 1e6:.1f} MB")
        del big_p, big_s, big_c

    # 4) アプリ（FastAPI と全ルート）を import しただけの RSS。import 前後の差を別プロセスで測る
    import subprocess

    extra = os.environ.get("EXTRA_SITE", "")
    code = (
        "import sys,os,subprocess\n"
        f"sys.path.insert(0,{str(BACKEND)!r})\n"
        + (f"sys.path.append({extra!r})\n" if extra else "")
        + "r=lambda:int(subprocess.run(['ps','-o','rss=','-p',str(os.getpid())],capture_output=True,text=True).stdout)/1024\n"
        "a=r()\nimport main\nb=r()\nprint(f'{a:.1f} -> {b:.1f}')\n"
    )
    out = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, cwd=str(BACKEND))
    print(f"\n## アプリ（FastAPI と全ルート）を import しただけの RSS（MB）: {out.stdout.strip() or out.stderr.strip()[-200:]}")


if __name__ == "__main__":
    {"db": db_part, "cpu": cpu_part, "memory": memory_part, "rss": rss_part, "variant": variant_part}[sys.argv[1]]()
