# 完了条件 #1・#2（I-36、NF-39、設計.md D-29）: 固定データ FD-1・FD-9・FD-10 で応答を確かめる。
# DB は使わない（偽の DB。SQL は本物と同じ文を流す）。
# テスト関数名は Issue の完了条件どおり（NF-32 の命名とは違うが、担当 matsuki の判断で Issue どおり）。
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from test_products_api import FD10
from test_products_filter import SpyDb, client_for, fd1, fd9

from db import Db, DbError

DESCRIPTIONS = {"C1": ("食品の特徴", "6個入り"), "C2": ("別の特徴", None)}  # C2 は size が空（NULL）
LIST_FIELDS = {
    "product_id",
    "name",
    "price",
    "category",
    "rating",
    "review_count",
    "delivery_days",
    "wrapping",
    "high_rating",
    "arrives_on",
    "scene_count",
}


class DetailDb(SpyDb):
    """SpyDb に、商品の特徴（description）とセット内容（size）の列を足した偽の DB"""

    def __init__(self) -> None:
        super().__init__([*fd1(), *fd9(), *FD10])
        self.raw.execute("ALTER TABLE products ADD COLUMN description TEXT")
        self.raw.execute("ALTER TABLE products ADD COLUMN size TEXT")
        for pid, (description, size) in DESCRIPTIONS.items():
            self.raw.execute(
                "UPDATE products SET description = ?, size = ? WHERE product_id = ?", (description, size, pid)
            )


class BrokenDb(Db):
    def fetch_all(self, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        raise DbError("OperationalError")


@pytest.fixture
def db() -> DetailDb:
    return DetailDb()


@pytest.fixture
def client(db: DetailDb) -> Iterator[TestClient]:
    yield from client_for(db)


# SP-12 SP-14 D-29 I-36
def test_found(client: TestClient) -> None:
    r = client.get("/api/products/P01")  # FD-1: 評価 4.5・20 件・2 日・ラッピング可
    assert r.status_code == 200
    body = r.json()
    assert set(body) == LIST_FIELDS | {"status", "description", "size"}
    assert body["status"] == "available"
    assert (body["name"], body["price"], body["rating"], body["review_count"]) == ("P01の商品", 4999, 4.5, 20)
    assert (body["delivery_days"], body["wrapping"], body["high_rating"]) == (2, True, True)
    # 絞り込み API の 1 件分と同じ項目・同じ値
    listed = client.get("/api/products", params={"scene": "送別", "price_band": "3000to4999"}).json()["items"]
    same = next(i for i in listed if i["product_id"] == "P01")
    assert {k: body[k] for k in LIST_FIELDS - {"scene_count"}} == {k: v for k, v in same.items() if k != "scene_count"}  # scene を付けない詳細は scene_count が null
    # 欠けた項目は null（P03: 評価欠損。列が無い description・size も null）
    p03 = client.get("/api/products/P03").json()
    assert (p03["rating"], p03["high_rating"], p03["description"], p03["size"]) == (None, False, None, None)
    assert client.get("/api/products/P02").json()["high_rating"] is False  # 4.49
    assert client.get("/api/products/Z30").json()["status"] == "available"  # FD-9
    # FD-10: C1 は特徴・セット内容の両方、C2 は size が無い
    c1 = client.get("/api/products/C1").json()
    assert (c1["category"], c1["description"], c1["size"]) == ("食品", "食品の特徴", "6個入り")
    c2 = client.get("/api/products/C2").json()
    assert (c2["description"], c2["size"]) == ("別の特徴", None)


# SP-12 SP-14 D-29 I-36 NF-39
def test_edge(client: TestClient, db: DetailDb) -> None:
    before = db.row_count()
    r = client.get("/api/products/P12")  # 在庫 0
    assert r.status_code == 200
    assert (r.json()["status"], r.json()["name"], r.json()["price"]) == ("out_of_stock", "P12の商品", 4000)
    assert client.get("/api/products/C4").json()["status"] == "out_of_stock"  # FD-10 の在庫 0
    r = client.get("/api/products/P99")  # 存在しない
    assert (r.status_code, r.json()["error"]["code"]) == (404, "not_found")
    calls = db.calls
    for bad in ("abc", "1.5", "1 OR 1=1", "1'; DROP TABLE share_links;--", "p01", "P", "P12345678901"):
        r = client.get(f"/api/products/{bad}")
        assert (r.status_code, r.json()["error"]["code"]) == (422, "invalid_product_id"), bad
    assert db.calls == calls  # 形式が不正なら DB を呼ばない
    assert db.row_count() == before
    assert db.raw.execute("SELECT COUNT(*) FROM products WHERE product_id = 'P12'").fetchone()[0] == 1
    # DB を失敗させると 500
    for c in client_for(BrokenDb()):
        r = TestClient(c.app, raise_server_exceptions=False).get("/api/products/P01")
        assert (r.status_code, r.json()["error"]["code"]) == (500, "internal_error")
