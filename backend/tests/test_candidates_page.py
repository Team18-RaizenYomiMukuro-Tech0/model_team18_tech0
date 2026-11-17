# R-01 の全件・12 件ずつ・回数順（#418 ADR-016、#432。設計 D-01・D-02・D-04・D-43、テスト設計 U-91・U-92）
# DB は使わない（偽の DB。SQL は本物と同じ文を流す）。班の DB での確認（I-63）は別。
from typing import Any

from candidates_support import CandidateDb, Product, client_for, ids, product
from fastapi.testclient import TestClient
from test_candidates_filter import LoggingDb

from ranking import order_by_scene_count, score_products


def fourteen() -> list[Product]:
    """FD-2（14 件、送別）: 点数がすべて別々。A14 が最高"""
    return [product(f"A{i:02d}", "送別", 1, 3000 + i * 10, 3.0 + i * 0.1, 10 + i) for i in range(1, 15)]


# D-01 D-28 U-92
def test_pages() -> None:
    for client in client_for(CandidateDb(fourteen())):
        order = [f"A{i:02d}" for i in range(14, 0, -1)]

        def page(q: str, client: TestClient = client) -> dict[str, Any]:
            r = client.get(f"/api/candidates?scene=送別&{q}")
            assert r.status_code == 200, r.text
            body: dict[str, Any] = r.json()
            return body

        first = page("page=1")
        assert [i["product_id"] for i in first["items"]] == order[:12]
        assert (first["count"], first["total"], first["page"], first["page_size"]) == (12, 14, 1, 12)
        assert page("page=") == page("page=1") == page("")  # 空・省略は 1 ページ目
        second = page("page=2")
        assert [i["product_id"] for i in second["items"]] == order[12:]
        assert (second["count"], second["total"], second["page"]) == (2, 14, 2)
        third = page("page=3")  # 最後を超えたら items が空（U-92）
        assert (third["items"], third["count"], third["total"], third["page"]) == ([], 0, 14, 3)
        assert "relax" not in third  # 条件に合う商品はあるので助け舟は付けない
        for bad in ("0", "-1", "abc", "1.5", "１"):
            r = client.get(f"/api/candidates?scene=送別&page={bad}")
            assert (r.status_code, r.json()["error"]["code"]) == (422, "invalid_page"), bad


# D-04 U-92: 全ページを足すと全件が 1 回ずつ
def test_pages_cover_everything_once() -> None:
    for client in client_for(CandidateDb(fourteen())):
        seen: list[str] = []
        for p in (1, 2):
            seen += ids(client, f"scene=送別&page={p}")
        assert sorted(seen) == [f"A{i:02d}" for i in range(1, 15)] and len(seen) == len(set(seen)) == 14


def five() -> tuple[list[Product], dict[str, int]]:
    """U-91: 回数 A=5（点数 4.50）・B=5（4.30）・C=8（4.00）・D=0（4.80）・E=5（4.50。A と同じ点数で商品ID が大きい）"""
    items = [
        product("A1", "送別", 1, 3500, 4.5, 100),
        product("B1", "送別", 1, 3500, 4.3, 100),
        product("C1", "送別", 1, 3500, 4.0, 100),
        product("D1", "送別", 1, 3500, 4.8, 100),
        product("E1", "送別", 1, 3500, 4.5, 100),
    ]
    return items, {"A1": 5, "B1": 5, "C1": 8, "D1": 0, "E1": 5}


# D-43 D-02 U-91（PM 決定 2026-11-17「2B」）
def test_scene_count_desc_order() -> None:
    items, counts = five()
    scores = score_products([(p["id"], p["rating"], p["count"]) for p in items])
    assert order_by_scene_count(scores, counts) == ["C1", "A1", "E1", "B1", "D1"]  # 回数 → 点数 → 商品ID。回数 0 は最後
    for client in client_for(CandidateDb(items, counts)):
        assert ids(client, "scene=送別&sort=scene_count_desc") == ["C1", "A1", "E1", "B1", "D1"]
        assert ids(client, "scene=送別") == ["D1", "A1", "E1", "B1", "C1"]  # おすすめ順は点数順のまま
        assert ids(client, "scene=送別&sort=recommend") == ["D1", "A1", "E1", "B1", "C1"]
        assert ids(client, "scene=送別&sort=") == ["D1", "A1", "E1", "B1", "C1"]
        body = client.get("/api/candidates?scene=送別&sort=scene_count_desc").json()
        assert [i["scene_count"]["n"] for i in body["items"]] == [8, 5, 5, 5, 0]


# D-43: 価格・評価・配送日数の順も R-01 で使える。不正な sort は 422
def test_other_sorts_and_invalid() -> None:
    items = [
        product("S1", "送別", 1, 4000, 4.0, 10),
        product("S2", "送別", 1, 3000, 3.0, 10),
        product("S3", "送別", 1, 5000, 5.0, 10),
    ]
    for client in client_for(CandidateDb(items)):
        assert ids(client, "scene=送別&sort=price_asc") == ["S2", "S1", "S3"]
        assert ids(client, "scene=送別&sort=rating_desc") == ["S3", "S1", "S2"]
        for bad in ("cheap", "PRICE_ASC", "price_desc", "scene_count_desc%20"):
            r = client.get(f"/api/candidates?scene=送別&sort={bad}")
            assert (r.status_code, r.json()["error"]["code"]) == (422, "invalid_sort"), bad


# D-04: 回数の集計は 1 回。回数順でも並び替えでも問い合わせは増えない
def test_one_count_query() -> None:
    items, counts = five()
    for query in ("scene=送別&sort=scene_count_desc", "scene=送別", "scene=送別&sort=price_asc"):
        db = LoggingDb(items, counts)
        for client in client_for(db):
            ids(client, query)
        counted = [params for sql, params in db.log if "COUNT(*)" in sql]
        assert len(counted) == 1, query
        assert counted[0][:4] == ("送別", "送別", 1, "会社")  # 値は params で渡す
