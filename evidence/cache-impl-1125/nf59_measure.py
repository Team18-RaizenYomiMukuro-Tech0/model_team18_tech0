# NF-59 の測定（設計 D-50・D-48、テスト設計 NF-59）: 商品と回数をメモリに置いたあとの、候補・絞り込みの速さ。
# 班の DB へは SELECT だけ（db.py の check_sql が SELECT・SHOW 以外を止める）。API はこのリポジトリの backend を同じプロセスで動かす（TestClient）。
# 使い方（接続情報は GIFTIA_BACKEND_ENV の .env から読む。表示しない）:
#   GIFTIA_BACKEND_ENV=<.env のパス> <backend の仮想環境>/bin/python evidence/cache-impl-1125/nf59_measure.py
# 条件ごとに: ①空の入れ物から 10 回続けて呼ぶ（読み込みが終わるまでは今の道＝空の回、終わったあとは当たった回）
#            ②読み込みが終わってから、当たった回をさらに 10 回 ③時計を 31 分進めて 1 回（古い値で先に返る）と、裏の読み直しが終わるまでの時間
# 時計は固定の Clock（D-11）を進める。31 分実際に待つわけではない（Functions の処理停止は測れない）。
import json
import os
import re
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve()
BACKEND = HERE.parents[2] / "backend"
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(BACKEND / "tests"))
if os.environ.get("GIFTIA_BACKEND_ENV"):
    from dotenv import load_dotenv

    load_dotenv(os.environ["GIFTIA_BACKEND_ENV"])  # 値は表示しない

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from catalog import Catalog, get_catalog  # noqa: E402
from catalog_support import LOADER_SQLS, TickClock  # noqa: E402
from clock import get_clock  # noqa: E402
from db import Db, get_db  # noqa: E402

CONDITIONS = {
    "①候補（送別・3000to4999）": "/api/candidates?scene=送別&price_band=3000to4999",
    "②候補（送別・価格帯なし）": "/api/candidates?scene=送別",
    "③絞り込み（条件なし・12 件）": "/api/products",
    "④絞り込み（送別＋3000to4999）": "/api/products?scene=送別&price_band=3000to4999",
}


class CountingDb(Db):
    def __init__(self) -> None:
        super().__init__()
        self.log: list[str] = []

    def fetch_all(self, sql, params=()):  # type: ignore[no-untyped-def]
        self.log.append(sql)
        return super().fetch_all(sql, params)

    def old_path(self) -> int:
        return sum(1 for s in self.log if s not in LOADER_SQLS)


def call(client: TestClient, db: CountingDb, path: str) -> dict:
    before = db.old_path()
    t = time.perf_counter()
    r = client.get(path)
    sec = time.perf_counter() - t
    nth = re.search(r"nth=(\d+)", r.headers.get("Server-Timing", ""))
    return {
        "sec": round(sec, 3),
        "status": r.status_code,
        "nth": int(nth.group(1)) if nth else None,
        "selects": db.old_path() - before,  # 今の道の SELECT の本数（0 なら入れ物から返した）
        "total": r.json().get("total") if r.status_code == 200 else None,
    }


def second_slowest(values: list[float]) -> float | None:
    return sorted(values)[-2] if len(values) >= 2 else None


def run_condition(name: str, path: str) -> dict:
    db, cat, clock = CountingDb(), Catalog(), TickClock()
    main.app.dependency_overrides[get_db] = lambda: db
    main.app.dependency_overrides[get_catalog] = lambda: cat
    main.app.dependency_overrides[get_clock] = lambda: clock
    client = TestClient(main.app)
    out: dict = {"name": name, "path": path}
    out["first10"] = []
    for _ in range(10):
        c = call(client, db, path)
        c["kind"] = "空（今の道）" if c["selects"] > 0 else "当たった"
        out["first10"].append(c)
    cat.wait(120)
    assert cat.snapshot is not None, "読み込みが終わらなかった"
    out["hit10"] = []
    for _ in range(10):
        c = call(client, db, path)
        c["kind"] = "当たった" if c["selects"] == 0 else "空（今の道）"
        out["hit10"].append(c)
    old = cat.snapshot
    clock.advance(31 * 60)  # 前の呼び出しから 31 分あけた（時計を進める）
    t0 = time.perf_counter()
    stale = call(client, db, path)
    stale["kind"] = "期限切れ（古い値で先に返す）" if stale["selects"] == 0 else "今の道"
    cat.wait(120)
    reload_sec = time.perf_counter() - t0  # 期限切れの呼び出しの始めから、読み直しが終わるまで
    stale["reload_done_sec"] = round(reload_sec, 3)
    stale["snapshot_replaced"] = cat.snapshot is not old
    out["stale"] = stale
    out["after_reload"] = call(client, db, path)
    main.app.dependency_overrides.clear()
    hits = [c["sec"] for c in out["first10"] + out["hit10"] if c["kind"] == "当たった"]
    out["hit_second_slowest"] = second_slowest([c["sec"] for c in out["hit10"]])
    out["hit_all_second_slowest"] = second_slowest(hits)
    empties = [c["sec"] for c in out["first10"] if c["kind"].startswith("空")]
    out["empty_count"] = len(empties)
    out["empty_max"] = max(empties) if empties else None
    out["empty_second_slowest"] = second_slowest(empties)
    return out


def main_run() -> None:
    results = [run_condition(n, p) for n, p in CONDITIONS.items()]
    raw = HERE.parent / "nf59_raw.json"
    raw.write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")
    for r in results:
        print(f"## {r['name']}  {r['path']}")
        print("最初の 10 回: " + " / ".join(f"{c['sec']:.3f}s[{c['kind'][:2]} nth={c['nth']} sel={c['selects']}]" for c in r["first10"]))
        print("当たった 10 回: " + " / ".join(f"{c['sec']:.3f}" for c in r["hit10"]))
        print(f"期限切れ: {r['stale']['sec']:.3f}s sel={r['stale']['selects']} 読み直し完了まで {r['stale']['reload_done_sec']:.3f}s 入れ替わり={r['stale']['snapshot_replaced']}")
        print(f"読み直し後: {r['after_reload']['sec']:.3f}s sel={r['after_reload']['selects']}")
        print(f"当たった遅い方から2番目={r['hit_second_slowest']}  空の回 {r['empty_count']} 回 最大={r['empty_max']}")


if __name__ == "__main__":
    main_run()
