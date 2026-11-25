# catalog_support.py — 商品と回数の入れ物（設計.md D-50）のテスト用の部品。テストではないので pytest は拾わない。
# 偽の DB（メモリ上の SQLite）に本物と同じ SQL を流し、入れ物の読み込みの SELECT（3 本）と今の道の SELECT を区別して数える。
import threading
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Any

from candidates_support import CandidateDb
from fastapi.testclient import TestClient
from test_products_filter import Product, product

import main
from catalog import SQL_COUNTS, SQL_PRODUCTS, SQL_SCENES, Catalog, get_catalog
from clock import Clock, get_clock
from db import DbError, get_db

LOADER_SQLS = (SQL_PRODUCTS, SQL_SCENES, SQL_COUNTS)
T0 = datetime(2026, 11, 25, 3, 0, 0, tzinfo=UTC)  # 水曜の昼ごろ（日本時間 12:00）


class TickClock(Clock):
    """固定の時計（D-11）。advance で進める"""

    def __init__(self) -> None:
        self.t = T0

    def now(self) -> datetime:
        return self.t

    def advance(self, seconds: float) -> None:
        self.t += timedelta(seconds=seconds)


class LogDb(CandidateDb):
    """流した SQL を順に記録する。裏の読み込みに渡す複製と記録・旗を共有する（copy.copy は参照を共有する）。
    gate を開けない間、読み込みの SELECT は止まる（今の道の SELECT は止まらない）。fail に入れた読み込みの SELECT は失敗する"""

    def __init__(self, products: list[Product], counts: dict[str, int] | None = None) -> None:
        super().__init__(products, counts)
        self.log: list[str] = []
        self.gate = threading.Event()
        self.gate.set()
        self.fail: set[str] = set()
        self.flags: dict[str, bool] = {"old_path_fails": False}

    def fetch_all(self, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        self.log.append(sql)
        if sql in LOADER_SQLS:
            assert self.gate.wait(10), "gate が開かない"
            if sql in self.fail:
                raise DbError("OperationalError")
        elif self.flags["old_path_fails"]:
            raise DbError("OperationalError")
        return super().fetch_all(sql, params)

    def loads(self) -> int:
        """読み込み（3 本のうち products）を始めた回数"""
        return self.log.count(SQL_PRODUCTS)

    def old_path_selects(self) -> int:
        """今の DB 直の道の SELECT の本数"""
        return sum(1 for s in self.log if s not in LOADER_SQLS)

    def loader_selects(self) -> int:
        return sum(1 for s in self.log if s in LOADER_SQLS)

    def mark(self) -> int:
        return len(self.log)

    def since(self, mark: int) -> list[str]:
        return self.log[mark:]


def many_products() -> list[Product]:
    """30 商品。シーン・価格帯・カテゴリー・評価が混ざる。評価と件数が同じ商品を含む（回数で並びが決まる）。S01 は在庫 0"""
    cats = ("生活雑貨", "食品", "コスメ", "飲料", "家電")
    out = []
    for i in range(1, 31):
        scene = ("送別", "お礼", "誕生日")[i % 3]
        out.append(
            product(
                f"S{i:02d}", scene, 0 if i == 1 else 1, 2500 + (i % 6) * 700, 3.0 + (i % 5) * 0.4, 5 + (i % 4) * 10,
                category=cats[i % 5], days=1 + i % 4, wrap=i % 2,
            )
        )  # fmt: skip
    out.append(product("T01", "送別", 1, 3500, 4.0, 20))  # 評価も件数も同じ 3 商品（回数で並びが決まる）
    out.append(product("T02", "送別", 1, 3500, 4.0, 20))
    out.append(product("T03", "送別", 1, 3500, 4.0, 20))
    return out


def many_db() -> LogDb:
    """商品に、送別（会社宛て・会社でない）・お礼・誕生日（友人・家族）・毎年決まった相手への贈答の注文を付ける（数え方は SP-16）"""
    db = LogDb(many_products())
    db.raw.execute("INSERT INTO product_scenes VALUES ('S02', '誕生日')")  # 2 つのシーンのタグを持つ商品
    for i in range(2, 31):
        pid = f"S{i:02d}"
        for _ in range(i % 5):
            db.add_order(pid, "送別", "会社")
        for _ in range(i % 3):
            db.add_order(pid, "送別", "個人")  # 会社宛てでないので送別に数えない
        for _ in range(i % 4):
            db.add_order(pid, "ビジネスのお礼", "個人")
        for _ in range(i % 3):
            db.add_order(pid, "友人への誕生日", "個人")
            db.add_order(pid, "家族への誕生日", "個人")
        db.add_order(pid, "毎年決まった相手への贈答", "会社")  # 数えない
    for _ in range(3):
        db.add_order("T02", "送別", "会社")
    for _ in range(2):
        db.add_order("T03", "送別", "会社")
    db.add_order("T01", "送別", "会社")
    return db


class Rig:
    """入れ物・時計・偽の DB をつないだ API"""

    def __init__(self, db: LogDb, cat: Catalog, clock: TickClock, client: TestClient) -> None:
        self.db, self.catalog, self.clock, self.client = db, cat, clock, client

    def get(self, path: str) -> Any:
        r = self.client.get(path)
        assert r.status_code == 200, r.text
        return r.json()


def make_rig(db: LogDb, cat: Catalog) -> Iterator[Rig]:
    clock = TickClock()
    main.app.dependency_overrides[get_db] = lambda: db
    main.app.dependency_overrides[get_clock] = lambda: clock
    main.app.dependency_overrides[get_catalog] = lambda: cat
    try:
        yield Rig(db, cat, clock, TestClient(main.app))
    finally:
        main.app.dependency_overrides.clear()


__all__ = ["LOADER_SQLS", "LogDb", "Rig", "TickClock", "make_rig", "many_db"]
