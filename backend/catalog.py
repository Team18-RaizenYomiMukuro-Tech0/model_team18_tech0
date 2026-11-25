# catalog.py — 商品と回数の入れ物（設計.md D-50・D-04、ADR-023。要件 N-03・N-14・N-18）
# 商品の行（products・product_scenes）と、商品×シーンの回数をアプリのメモリに期限つきで置く。DB には保存しない。台（プロセス）ごとに別の入れ物。
#  - 読み込み: SELECT は 3 本（products・product_scenes・回数の一括 ①b）。D-12 の実行口（Db）を通る（10 秒の上限・書き込みの禁止はそのまま）。
#    3 本がそろったときだけ入れる（途中の値は入れない）。
#  - 空の間（一度も値が入っていない）は、使う側が今の DB 直の道で返す（current が None を返す）。読み込みは空を見つけた最初の要求が裏で始める。
#    読み込み中に重なった要求は、読み込みを重ねず、すべて今の道で返す。読み込みが失敗したら空のまま（次の空の要求がまた始める）。
#  - 期限（TTL。config.CATALOG_TTL_SECONDS）が切れても、待たずに古い値で返す。読み直しは最初の要求が裏で 1 回だけ始める。失敗したら古い値のまま。
#  - 期限は読み込みが終わった時刻（D-11 の時計）から数える。
#  - 画面に「◯分前」は出さない。Redis など外部のキャッシュは使わない。
import copy
import threading
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from clock import Clock
from config import SETTINGS
from db import Db

# 商品の行。D-01・D-28 の今の SELECT と同じ列。在庫 1 以上だけ（在庫 0 は出さない）
SQL_PRODUCTS = (
    "SELECT p.product_id, p.product_name, p.price, p.category, p.rating, p.review_count, "
    "p.delivery_days, p.gift_wrap "
    "FROM products p "
    "WHERE p.stock >= 1"
)
SQL_SCENES = "SELECT s.product_id, s.scene_tag FROM product_scenes s"
# 回数の一括（①b。商品ごとに 1 行。3 シーンの回数を列で返す）。数え方は SP-16 / decision.py のとおり
#  送別＝送別かつ会社宛て、お礼＝ビジネスのお礼、誕生日＝友人への誕生日と家族への誕生日（毎年決まった相手への贈答は数えない）
SQL_COUNTS = (
    "SELECT oi.product_id AS product_id, "
    "SUM(CASE WHEN o.estimated_scene = %s AND o.ship_to_type = %s THEN 1 ELSE 0 END) AS sendoff, "
    "SUM(CASE WHEN o.estimated_scene = %s THEN 1 ELSE 0 END) AS thanks, "
    "SUM(CASE WHEN o.estimated_scene IN (%s, %s) THEN 1 ELSE 0 END) AS birthday "
    "FROM order_items oi JOIN orders o ON o.order_id = oi.order_id "
    "WHERE o.estimated_scene IN (%s, %s, %s, %s) "
    "GROUP BY oi.product_id"
)
COUNT_PARAMS = (
    "送別", "会社", "ビジネスのお礼", "友人への誕生日", "家族への誕生日",
    "送別", "ビジネスのお礼", "友人への誕生日", "家族への誕生日",
)  # fmt: skip
COUNT_COLUMN = {"送別": "sendoff", "お礼": "thanks", "誕生日": "birthday"}  # シーン → SQL_COUNTS の列


@dataclass(frozen=True)
class Snapshot:
    """3 本がそろったときの中身。作ったあとは変えない（読むだけ）"""

    rows: tuple[dict[str, Any], ...]  # 在庫 1 以上の商品の行
    tags: dict[str, frozenset[str]]  # 商品 ID → シーンのタグ
    counts: dict[str, dict[str, int]]  # 商品 ID → {シーン: 回数}（0 の回数は持たない）
    loaded_at: datetime

    def select(
        self, scene: str | None, price_range: tuple[int, int], categories: Sequence[str]
    ) -> list[dict[str, Any]]:
        """D-01・D-28 の今の SELECT と同じ絞り込み（シーン・価格帯の下限と上限を含む・カテゴリーのどれか）。価格が無い商品は出ない"""
        low, high = price_range
        out = []
        for r in self.rows:
            price = r["price"]
            if price is None or price < low or price > high:
                continue
            if categories and r["category"] not in categories:
                continue
            if scene is not None and scene not in self.tags.get(str(r["product_id"]), ()):
                continue
            out.append(r)
        return out

    def scene_counts(self, scene: str, product_ids: Sequence[str]) -> dict[str, int]:
        """decision.scene_counts と同じ形（回数が 1 以上の商品だけ入る。無い商品は呼び出し側が 0 とみなす）"""
        out: dict[str, int] = {}
        for pid in product_ids:
            n = self.counts.get(str(pid), {}).get(scene, 0)
            if n > 0:
                out[str(pid)] = n
        return out

    def relax_counts(
        self, scene: str | None, price_range: tuple[int, int] | None, categories: Sequence[str]
    ) -> dict[str, int | None]:
        """api.products.relax_counts と同じ（0 件の助け舟。D-44）。シーンははずさない"""
        base = self.select(scene, (0, 2147483647), [])
        low, high = price_range if price_range is not None else (0, 2147483647)
        no_price = sum(1 for r in base if not categories or r["category"] in categories)
        no_category = sum(1 for r in base if r["price"] is not None and low <= r["price"] <= high)
        return {
            "price_band": no_price if price_range is not None else None,
            "category": no_category if categories else None,
        }


def load_snapshot(db: Db, clock: Clock) -> Snapshot:
    """SELECT 3 本で読む。どれかが失敗したら例外のまま上げる（途中の値は返さない）。loaded_at は読み終わった時刻"""
    products = db.fetch_all(SQL_PRODUCTS)
    scenes = db.fetch_all(SQL_SCENES)
    count_rows = db.fetch_all(SQL_COUNTS, COUNT_PARAMS)
    tags: dict[str, set[str]] = {}
    for r in scenes:
        tags.setdefault(str(r["product_id"]), set()).add(str(r["scene_tag"]))
    counts: dict[str, dict[str, int]] = {}
    for r in count_rows:
        per = {scene: int(r[col] or 0) for scene, col in COUNT_COLUMN.items()}
        counts[str(r["product_id"])] = {s: n for s, n in per.items() if n > 0}
    return Snapshot(
        rows=tuple(products),
        tags={pid: frozenset(v) for pid, v in tags.items()},
        counts=counts,
        loaded_at=clock.now(),
    )


class Catalog:
    """台（プロセス）ごとの入れ物。enabled=False はテストでだけ（何も読まず、いつも今の道）。sync=True もテストでだけ（読み込みを同期で終わらせる）"""

    def __init__(
        self,
        ttl_seconds: int | None = None,
        *,
        enabled: bool = True,
        sync: bool = False,
        loader: Callable[[Db, Clock], Snapshot] = load_snapshot,
    ) -> None:
        self._ttl = timedelta(seconds=SETTINGS.CATALOG_TTL_SECONDS if ttl_seconds is None else ttl_seconds)
        self._enabled = enabled
        self._sync = sync
        self._loader = loader
        self._lock = threading.Lock()
        self._snapshot: Snapshot | None = None
        self._loading = False
        self._thread: threading.Thread | None = None

    def current(self, db: Db, clock: Clock) -> Snapshot | None:
        """使える中身（期限切れなら古い値）。空なら None（使う側は今の道で返す）。読み込み・読み直しが要れば、待たずに始める"""
        if not self._enabled:
            return None
        snap = self._snapshot
        if snap is None or clock.now() - snap.loaded_at > self._ttl:  # TTL を超えたら期限切れ（ちょうどは期限内）
            self._start_load(db, clock)
        return snap

    @property
    def snapshot(self) -> Snapshot | None:
        """いま入っている中身（読み込みを始めない。空なら None）。テストと確認用"""
        return self._snapshot

    def wait(self, timeout: float = 60.0) -> None:
        """裏の読み込みが終わるのを待つ（テストでだけ使う）"""
        t = self._thread
        if t is not None:
            t.join(timeout)

    def _start_load(self, db: Db, clock: Clock) -> None:
        with self._lock:
            if self._loading:  # 同じ台で 1 回だけ（重ねない）
                return
            self._loading = True
        background = copy.copy(db)  # 計測の内訳（Server-Timing）に裏の読み込みを混ぜないため、内訳だけ別にする
        background.timings = []
        if self._sync:
            self._load(background, clock)
            return
        t = threading.Thread(target=self._load, args=(background, clock), daemon=True)
        self._thread = t
        t.start()

    def _load(self, db: Db, clock: Clock) -> None:
        try:
            snap = self._loader(db, clock)
        except Exception:  # noqa: BLE001  失敗は入れ物を変えない（空なら空のまま、古い値なら古いまま）。次の要求がまた始める
            snap = None
        with self._lock:
            if snap is not None:
                self._snapshot = snap  # 3 本がそろったときだけ、まとめて入れ替える
            self._loading = False


_CATALOG = Catalog()


def get_catalog() -> Catalog:
    """FastAPI の依存（Depends）。台に 1 つの入れ物を返す"""
    return _CATALOG
