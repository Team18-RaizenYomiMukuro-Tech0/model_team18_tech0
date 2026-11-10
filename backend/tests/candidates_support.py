# candidates_support.py — GET /api/candidates のテスト用の固定データと偽の DB（メモリ上の SQLite）。
# 本物と同じ SQL を流すので、絞り込みと送別回数の集計そのものを確かめる。テストではないので pytest は拾わない。
from fastapi.testclient import TestClient
from test_products_filter import Product, SpyDb, client_for, product

__all__ = ["CandidateDb", "Product", "client_for", "fd1", "fd1_counts", "fd2", "fd4", "fd5", "fd6", "ids", "product"]

EXTRA_SCHEMA = """
CREATE TABLE orders (order_id TEXT PRIMARY KEY, estimated_scene TEXT, ship_to_type TEXT, gift_purpose TEXT);
CREATE TABLE order_items (order_id TEXT, product_id TEXT);
"""


class CandidateDb(SpyDb):
    """商品と、商品ごとの送別回数（送別・会社宛ての注文の数）を持つ偽の DB"""

    def __init__(self, products: list[Product], counts: dict[str, int] | None = None) -> None:
        super().__init__(products)
        self.raw.executescript(EXTRA_SCHEMA)
        self._n = 0
        for pid, n in (counts or {}).items():
            for _ in range(n):
                self.add_order(pid, "送別", "会社")

    def add_order(self, pid: str, scene: str, ship_to: str, purpose: str | None = None) -> None:
        self._n += 1
        oid = f"O{self._n:06d}"
        self.raw.execute("INSERT INTO orders VALUES (?,?,?,?)", (oid, scene, ship_to, purpose))
        self.raw.execute("INSERT INTO order_items VALUES (?,?)", (oid, pid))

    def table_counts(self) -> tuple[int, int, int]:
        def n(t: str) -> int:
            return int(self.raw.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0])

        return n("products"), n("orders"), n("order_items")


def fd1() -> list[Product]:
    """FD-1（テスト設計.md。評価・件数・価格・在庫）。配送日数・ラッピングは表のとおり"""
    return [
        product("P01", "送別", 1, 4999, 4.5, 20, days=2, wrap=1),
        product("P02", "送別", 1, 3000, 4.49, 20, days=3, wrap=0),
        product("P03", "送別", 1, 4000, None, 0, days=2, wrap=1),
        product("P04", "送別", 1, 2999, 4.5, 20, days=2, wrap=1),
        product("P05", "送別", 1, 5000, 4.5, 20, days=2, wrap=1),
        product("P06", "誕生日", 1, 4000, 4.8, 50, days=2, wrap=1),
        product("P07", "送別", 1, 4000, 4.5, 0, days=2, wrap=1),
        product("P08", "送別", 1, 3800, 4.9, 3, days=2, wrap=1),
        product("P09", "送別", 1, 3800, 4.6, 120, days=2, wrap=1),
        product("P10", "送別", 1, 3600, 3.0, 50, days=3, wrap=0),
        product("P11", "送別", 1, 3600, 3.2, 40, days=3, wrap=0),
        product("P12", "送別", 0, 4000, 1.0, 80, days=2, wrap=1),
        product("P13", "送別", 1, 50000, 4.8, 100, days=2, wrap=1),
    ]


def fd1_counts() -> dict[str, int]:
    """FD-1 の送別回数（P06 は誕生日の商品。送別の注文は付けない）"""
    return {"P01": 12, "P02": 5, "P03": 3, "P04": 9, "P05": 9, "P07": 7, "P08": 0, "P09": 48, "P10": 1, "P11": 0, "P12": 20, "P13": 2}


def fd2() -> list[Product]:
    """FD-2: 送別タグ・在庫有・価格 3,000〜4,999 の 12 件（点数がすべて別々。A12 が最高）"""
    return [product(f"A{i:02d}", "送別", 1, 3000 + i * 100, 3.0 + i * 0.1, 10 + i) for i in range(1, 13)]


def fd4() -> list[Product]:
    return [product(f"T{i}", "送別", 1, 3500, 4.0, 20) for i in (1, 2, 3)]


def fd5() -> list[Product]:
    return [
        product("Q1", "送別", 1, 3500, 5.0, None),
        product("Q2", "送別", 1, 3500, None, 5),
        product("Q3", "送別", 1, 3500, 4.4, 20),
        product("Q4", "送別", 1, 3500, 3.6, 20),
    ]


def fd6() -> list[Product]:
    return [product(pid, "送別", 1, 3500, None, None) for pid in ("V1", "V2", "V3")]


def ids(client: TestClient, query: str) -> list[str]:
    r = client.get(f"/api/candidates?{query}")
    assert r.status_code == 200, r.text
    return [i["product_id"] for i in r.json()["items"]]
