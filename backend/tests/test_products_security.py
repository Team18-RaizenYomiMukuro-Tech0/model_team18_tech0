# 完了条件 #4（NF-39、設計.md N-04）: R-02 の API に不正値・SQL らしい値を送る。
# 422（invalid_scene / invalid_price_band / invalid_page / invalid_product_id）になり、500 にならず、
# DB を呼ばず、既存テーブルと share_links の行数・テーブルが前後で同じことを確かめる。DB は使わない（偽の DB。SQL は本物と同じ文）。
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from test_product_detail import DetailDb
from test_products_filter import client_for


class SecurityDb(DetailDb):
    """DetailDb に share_links を足し、全テーブルの行数を数えられる偽の DB"""

    def __init__(self) -> None:
        super().__init__()
        self.raw.execute(
            "CREATE TABLE share_links (share_id TEXT PRIMARY KEY, items TEXT, created_at TEXT, is_test INTEGER)"
        )
        self.raw.execute(
            "INSERT INTO share_links VALUES ('seed', '[]', '2026-11-14 00:00:00', 1)"
        )

    def snapshot(self) -> dict[str, int]:
        tables = [
            r[0]
            for r in self.raw.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        ]
        return {
            t: int(self.raw.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0])
            for t in sorted(tables)
        }


@pytest.fixture
def db() -> SecurityDb:
    return SecurityDb()


@pytest.fixture
def client(db: SecurityDb) -> Iterator[TestClient]:
    yield from client_for(db)


LIST_CASES: list[tuple[str, str, str]] = [
    ("scene", "送別' OR '1'='1", "invalid_scene"),
    ("price_band", "3000to4999; DROP TABLE share_links;--", "invalid_price_band"),
    ("page", "1 OR 1=1", "invalid_page"),
]
DETAIL_CASES = ["1 OR 1=1", "1'; DROP TABLE share_links;--"]


# N-04 NF-39 NF-08
def test_list_rejects_sql_like_values(client: TestClient, db: SecurityDb) -> None:
    before, calls = db.snapshot(), db.calls
    assert "share_links" in before
    for name, value, code in LIST_CASES:
        r = client.get("/api/products", params={name: value})
        assert r.status_code == 422, (name, value, r.status_code)
        assert r.json()["error"]["code"] == code, (name, value)
    assert db.calls == calls  # 不正な値は DB を呼ばない
    assert db.snapshot() == before  # 既存テーブルと share_links の行数・テーブルは同じ


# N-04 NF-39 NF-08
def test_detail_rejects_sql_like_values(client: TestClient, db: SecurityDb) -> None:
    before, calls = db.snapshot(), db.calls
    for value in DETAIL_CASES:
        r = client.get(f"/api/products/{value}")
        assert r.status_code == 422, (value, r.status_code)
        assert r.json()["error"]["code"] == "invalid_product_id", value
    assert db.calls == calls
    assert db.snapshot() == before


# N-04 NF-39: 正しい値のときも読み取りのみ（行数は同じ）。422 と 500 を取り違えない（正しい値は 200）
def test_valid_requests_do_not_write(client: TestClient, db: SecurityDb) -> None:
    before = db.snapshot()
    params: dict[str, Any] = {"scene": "送別", "price_band": "3000to4999", "page": "1"}
    assert client.get("/api/products", params=params).status_code == 200
    assert client.get("/api/products/Z01").status_code == 200
    assert client.get("/api/products/P99").status_code == 404
    assert db.snapshot() == before
