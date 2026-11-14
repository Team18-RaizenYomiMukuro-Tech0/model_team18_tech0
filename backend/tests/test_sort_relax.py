# Issue #282（D3）: 並び替え sort（D-43）と 0 件の助け舟 relax（D-44）。テスト設計 U-71・I-48〜I-50（U-77 は画面）。
# DB は使わない（偽の DB。SQL は本物と同じ文）。
from candidates_support import CandidateDb, client_for, product
from fastapi.testclient import TestClient

from ranking import order_by_sort


def ids(client: TestClient, query: str) -> list[str]:
    r = client.get(f"/api/products?{query}")
    assert r.status_code == 200, r.text
    return [i["product_id"] for i in r.json()["items"]]


def data() -> list[dict]:
    """価格・評価・件数・配送日数が違う商品に、評価なし・配送日数なし・同じ値の商品を混ぜる"""
    return [
        product("A1", "送別", 1, 3000, 4.0, 10, days=3),
        product("A2", "送別", 1, 3000, 4.5, 10, days=3),  # A1 と同じ価格・配送日数。評価が高い
        product("A3", "送別", 1, 3000, None, None, days=None),  # 評価なし・配送日数なし
        product("A4", "送別", 1, 2000, 3.0, 5, days=5),
        product("A5", "送別", 1, 4000, 4.5, 50, days=1),  # A2 と評価が同じ。件数が多い
        product("A6", "送別", 1, 4000, 4.5, 50, days=1),  # A5 と全部同じ（商品ID順）
    ]


# U-71 D-43: 4 つの並び。同じ値どうしの順
def test_sort_orders() -> None:
    for client in client_for(CandidateDb(data())):
        assert ids(client, "sort=price_asc") == ["A4", "A2", "A1", "A3", "A5", "A6"]
        assert ids(client, "sort=rating_desc") == ["A5", "A6", "A2", "A1", "A4", "A3"]
        assert ids(client, "sort=delivery_asc") == ["A5", "A6", "A2", "A1", "A4", "A3"]
        rec = ids(client, "sort=recommend")
        assert rec == ids(client, "") == ids(client, "sort=")  # 省略・空は recommend と同じ（I-48）


def test_sort_pure_function_ties() -> None:
    # (商品ID, 価格, 評価, 件数, 配送日数)
    items = [("B", 100, None, None, None), ("A", 100, None, None, None), ("C", 100, 4.0, 1, 2)]
    assert order_by_sort(items, "price_asc") == ["C", "A", "B"]  # 同じ価格は評価の高い順（なしは後ろ）→ 商品ID順
    assert order_by_sort(items, "delivery_asc") == ["C", "A", "B"]  # 配送日数なしは最後
    assert order_by_sort(items, "rating_desc") == ["C", "A", "B"]


# I-48: 並びが違っても total は同じ。page=2 は同じ並びの続き（重複・抜けなし）
def test_sort_paging_is_consistent() -> None:
    many = [product(f"M{i:02d}", "送別", 1, 1000 + (i * 37) % 11 * 100, 3.0 + (i % 5) * 0.3, 10 + i, days=1 + i % 4) for i in range(1, 31)]
    for client in client_for(CandidateDb(many)):
        for sort in ("price_asc", "rating_desc", "delivery_asc", "recommend"):
            p1 = client.get(f"/api/products?sort={sort}&page=1").json()
            p2 = client.get(f"/api/products?sort={sort}&page=2").json()
            p3 = client.get(f"/api/products?sort={sort}&page=3").json()
            got = [i["product_id"] for p in (p1, p2, p3) for i in p["items"]]
            assert (p1["total"], p2["total"], p3["total"]) == (30, 30, 30)
            assert sorted(got) == sorted(i["id"] for i in many) and len(set(got)) == 30
            assert got == ids(client, f"sort={sort}&page=1") + ids(client, f"sort={sort}&page=2") + ids(client, f"sort={sort}&page=3")


# I-49: 4 つ以外は 422 invalid_sort（大文字も）。候補（R-01）は sort を読まない
def test_invalid_sort_and_candidates_ignore_sort() -> None:
    for client in client_for(CandidateDb(data())):
        for bad in ("cheap", "PRICE_ASC", "price_asc%20", "price_desc"):
            r = client.get(f"/api/products?sort={bad}")
            assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_sort", bad
        base = client.get("/api/candidates?scene=送別").json()
        assert client.get("/api/candidates?scene=送別&sort=price_asc").json() == base
        assert client.get("/api/candidates?scene=送別&sort=cheap").status_code == 200  # 読まないので 422 にしない


def relax_data() -> list[dict]:
    return [
        product("R1", "送別", 1, 2000, 4.0, 10, category="食品"),
        product("R2", "送別", 1, 2500, 4.0, 10, category="食品"),
        product("R3", "送別", 1, 3500, 4.0, 10, category="食品"),
        product("R4", "送別", 1, 3500, 4.0, 10, category="飲料"),
        product("R5", "送別", 1, 3500, 4.0, 10, category="飲料"),
        product("R6", "送別", 0, 3500, 4.0, 10, category="家電"),  # 在庫なし。数えない
        product("R7", "お礼", 1, 4500, 4.0, 10, category="家電"),
    ]


# I-50 D-44: 0 件のときだけ relax。件数は、その条件をはずして呼び直した total と同じ。選んでいない条件は null。シーンははずさない
def test_relax_matches_dropped_totals() -> None:
    db = CandidateDb(relax_data())
    for client in client_for(db):
        # ① シーンなし・価格帯＋カテゴリー（0 件）: 価格帯をはずすと 食品 3 件、カテゴリーをはずすと 〜2,999円 が 2 件
        r = client.get("/api/products?price_band=5000plus&category=食品").json()
        assert r["total"] == 0 and r["relax"] == {"price_band": 3, "category": 0}
        r = client.get("/api/products?price_band=under3000&category=家電").json()
        assert r["total"] == 0
        assert r["relax"]["price_band"] == client.get("/api/products?category=家電").json()["total"] == 1
        assert r["relax"]["category"] == client.get("/api/products?price_band=under3000").json()["total"] == 2
        # ② シーンあり・価格帯＋カテゴリー（シーンははずさない。R7 はお礼なので送別の件数に入らない）
        r = client.get("/api/products?scene=送別&price_band=under3000&category=家電").json()
        assert r["total"] == 0 and r["relax"] == {"price_band": 0, "category": 2}
        c = client.get("/api/candidates?scene=送別&price_band=under3000&category=家電").json()
        assert c["count"] == 0 and c["relax"] == r["relax"]  # 候補（R-01）も同じ数え方
        # ③ 価格帯だけ・カテゴリーだけの 0 件。選んでいない条件は null
        r = client.get("/api/products?scene=送別&price_band=5000plus").json()
        assert r["total"] == 0 and r["relax"] == {"price_band": 5, "category": None}  # 価格帯をはずすと送別の在庫あり 5 件。カテゴリーは選んでいないので null
        r = client.get("/api/products?scene=誕生日").json()
        assert r["total"] == 0 and r["relax"] == {"price_band": None, "category": None}
        # 0 件でない応答に relax は無い。シーンだけの 0 件にならない組も
        assert "relax" not in client.get("/api/products?scene=送別").json()
        assert "relax" not in client.get("/api/candidates?scene=送別").json()
        # 往復は 0 件のときだけ +1（D-44）
        before = db.calls
        client.get("/api/products?scene=送別")
        assert db.calls - before == 2  # 一覧の抽出 ＋ 12 件の回数（relax なし）
        before = db.calls
        client.get("/api/products?scene=誕生日")
        assert db.calls - before == 2  # 抽出 ＋ relax（0 件なので回数は数えない）
