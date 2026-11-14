# 完了条件 #1・#2（U-39・U-40、設計.md D-28・D-02）: 固定データ FD-9・FD-1・FD-4 で絞り込みと並びを確かめる。
# DB は使わない。偽の接続（メモリ上の SQLite）に同じ SQL を流すので、SQL の絞り込みそのものを確かめる。
import sqlite3
from collections.abc import Iterator
from typing import Any, Self

import pytest
from fastapi.testclient import TestClient

import main
from db import Db, get_db

SCHEMA = """
CREATE TABLE products (
  product_id TEXT PRIMARY KEY, product_name TEXT, category TEXT, price INTEGER, rating REAL,
  review_count INTEGER, delivery_days INTEGER, gift_wrap INTEGER, stock INTEGER);
CREATE TABLE product_scenes (product_id TEXT, scene_tag TEXT);
CREATE TABLE orders (order_id TEXT PRIMARY KEY, estimated_scene TEXT, ship_to_type TEXT, gift_purpose TEXT);
CREATE TABLE order_items (order_id TEXT, product_id TEXT);
"""

Product = dict[str, Any]


def product(
    pid: str,
    scene: str | None,
    stock: int,
    price: int,
    rating: float | None,
    count: int | None,
    category: str = "生活雑貨",
    days: int | None = 2,
    wrap: int | None = 1,
) -> Product:
    return {
        "id": pid,
        "scene": scene,
        "stock": stock,
        "price": price,
        "rating": rating,
        "count": count,
        "category": category,
        "days": days,
        "wrap": wrap,
    }


def fd9() -> list[Product]:
    """FD-9: Z01〜Z30（送別・3000to4999・点数がすべて別々）と Y1〜Y5"""
    zs = [
        product(f"Z{i:02d}", "送別", 1, 3000 + i * 10, 3.0 + i * 0.04, 10 + i)
        for i in range(1, 31)
    ]
    return zs + [
        product("Y1", "送別", 1, 2999, 4.0, 10),
        product("Y2", "送別", 1, 1000, 4.1, 11),
        product("Y3", "誕生日", 1, 4000, 4.2, 12),
        product("Y4", "送別", 1, 5000, 4.3, 13),
        product("Y5", "送別", 0, 4000, 4.4, 14),
    ]


def fd1() -> list[Product]:
    """FD-1（評価・件数・価格・在庫）"""
    return [
        product("P01", "送別", 1, 4999, 4.5, 20),
        product("P02", "送別", 1, 3000, 4.49, 20),
        product("P03", "送別", 1, 4000, None, 0),
        product("P04", "送別", 1, 2999, 4.5, 20),
        product("P05", "送別", 1, 5000, 4.5, 20),
        product("P06", "誕生日", 1, 4000, 4.8, 50),
        product("P07", "送別", 1, 4000, 4.5, 0),
        product("P08", "送別", 1, 3800, 4.9, 3),
        product("P09", "送別", 1, 3800, 4.6, 120),
        product("P10", "送別", 1, 3600, 3.0, 50),
        product("P11", "送別", 1, 3600, 3.2, 40),
        product("P12", "送別", 0, 4000, 1.0, 80),
        product("P13", "送別", 1, 50000, 4.8, 100),
    ]


def fd4() -> list[Product]:
    """FD-4: 評価・件数が同じ 3 商品（R-02 は送別回数を見ないので商品ID順）"""
    return [product(f"T{i}", "送別", 1, 3500, 4.0, 20) for i in (1, 2, 3)]


class FakeCursor:
    def __init__(self, conn: sqlite3.Connection) -> None:
        self.cur = conn.cursor()

    def __enter__(self) -> Self:
        return self

    def __exit__(self, *a: object) -> None:
        return None

    def execute(self, sql: str, params: tuple[Any, ...] = ()) -> None:
        self.cur.execute(sql.replace("%s", "?"), params)

    def fetchall(self) -> list[dict[str, Any]]:
        names = [d[0] for d in self.cur.description]
        return [dict(zip(names, row, strict=True)) for row in self.cur.fetchall()]


class FakeConn:
    def __init__(self, conn: sqlite3.Connection) -> None:
        self.conn = conn

    def cursor(self) -> FakeCursor:
        return FakeCursor(self.conn)

    def commit(self) -> None:
        return None

    def close(self) -> None:
        return None  # 共有の接続なので閉じない


class SpyDb(Db):
    """偽の DB（SQLite）に同じ SQL を流す Db。呼ばれた回数を数える"""

    def __init__(self, products: list[Product]) -> None:
        raw = sqlite3.connect(":memory:", check_same_thread=False)
        raw.executescript(SCHEMA)
        for p in products:
            raw.execute(
                "INSERT INTO products VALUES (?,?,?,?,?,?,?,?,?)",
                (
                    p["id"],
                    p["id"] + "の商品",
                    p["category"],
                    p["price"],
                    p["rating"],
                    p["count"],
                    p["days"],
                    p["wrap"],
                    p["stock"],
                ),
            )
            if p["scene"] is not None:
                raw.execute(
                    "INSERT INTO product_scenes VALUES (?,?)", (p["id"], p["scene"])
                )
        self.raw = raw
        self.calls = 0
        super().__init__(connect=lambda: FakeConn(raw))

    def fetch_all(self, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        self.calls += 1
        return super().fetch_all(sql, params)

    def row_count(self) -> int:
        return int(self.raw.execute("SELECT COUNT(*) FROM products").fetchone()[0])


def client_for(db: Db) -> Iterator[TestClient]:
    main.app.dependency_overrides[get_db] = lambda: db
    try:
        yield TestClient(main.app)
    finally:
        main.app.dependency_overrides.clear()


@pytest.fixture
def fd9_client() -> Iterator[TestClient]:
    yield from client_for(SpyDb(fd9()))


def total(client: TestClient, query: str) -> int:
    r = client.get(f"/api/products?{query}")
    assert r.status_code == 200, r.text
    return int(r.json()["total"])


def test_filter_counts(fd9_client: TestClient) -> None:
    """U-39: 条件間は AND。在庫 0 の Y5 はどれにも入らない"""
    assert total(fd9_client, "scene=送別") == 33
    assert total(fd9_client, "price_band=3000to4999") == 31
    assert total(fd9_client, "scene=送別&price_band=3000to4999") == 30
    assert total(fd9_client, "scene=誕生日&price_band=under3000") == 0
    assert total(fd9_client, "") == 34


def test_out_of_stock_never_listed(fd9_client: TestClient) -> None:
    for query in (
        "scene=送別",
        "price_band=3000to4999",
        "scene=送別&price_band=3000to4999",
        "",
    ):
        ids: list[str] = []
        for page in (1, 2, 3, 4):
            ids += [
                i["product_id"]
                for i in fd9_client.get(f"/api/products?{query}&page={page}").json()[
                    "items"
                ]
            ]
        assert "Y5" not in ids


def test_price_band_edges(fd9_client: TestClient) -> None:
    def ids(band: str) -> set[str]:
        out: set[str] = set()
        for page in (1, 2, 3):
            out |= {
                i["product_id"]
                for i in fd9_client.get(
                    f"/api/products?scene=送別&price_band={band}&page={page}"
                ).json()["items"]
            }
        return out

    assert {"Y1", "Y2"} <= ids("under3000") and "Z01" not in ids("under3000")
    assert "Y1" not in ids("3000to4999") and "Y4" not in ids("3000to4999")
    assert "Y4" in ids("5000plus")


def ordered_ids(client: TestClient, query: str) -> list[str]:
    r = client.get(f"/api/products?{query}")
    assert r.status_code == 200
    return [i["product_id"] for i in r.json()["items"]]


def test_order() -> None:
    """U-40: R-01 と同じ式の点数の高い順。同点は商品ID順（R-02 は送別回数を数えない）"""
    # ① FD-1、送別＋3000to4999。C は絞り込んだ商品で求める（4.115）
    for client in client_for(SpyDb(fd1())):
        assert ordered_ids(client, "scene=送別&price_band=3000to4999") == [
            "P09", "P01", "P02", "P08", "P03", "P07", "P11", "P10",
        ]  # fmt: skip
    # ② FD-4: 評価・件数が同じなら商品ID順
    for client in client_for(SpyDb(fd4())):
        assert ordered_ids(client, "scene=送別") == ["T1", "T2", "T3"]
    # FD-9: 評価・件数が大きい Z から順（点数がすべて別々）
    for client in client_for(SpyDb(fd9())):
        assert ordered_ids(client, "scene=送別&price_band=3000to4999")[:3] == [
            "Z30",
            "Z29",
            "Z28",
        ]
