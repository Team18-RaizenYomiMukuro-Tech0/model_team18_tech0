# T2 #68: 結合テストのうち、既存のテストで確かめていなかった分（偽の DB。班の DB は使わない）
# I-30 / I-31 / I-32 / I-33 / I-35 / I-40、E-13（候補取得）。期待結果はテスト設計.md のとおり
import time
from typing import Any

import pytest
from candidates_support import CandidateDb, client_for, fd1, fd1_counts, ids
from fastapi.testclient import TestClient
from test_products_filter import SpyDb, fd9

import main
from db import Db, get_db


@pytest.fixture
def fd1_api() -> Any:
    yield from client_for(CandidateDb(fd1(), fd1_counts()))


@pytest.fixture
def fd9_api() -> Any:
    yield from client_for(SpyDb(fd9()))


# SP-01 / I-30: 価格帯の境界（P04=2,999 は under3000 だけ、P02=3,000・P01=4,999 は 3000to4999 だけ、P05=5,000 は 5000plus）
def test_band_boundaries(fd1_api: TestClient) -> None:
    under = ids(fd1_api, "scene=送別&price_band=under3000")
    mid = ids(fd1_api, "scene=送別&price_band=3000to4999")
    plus = ids(fd1_api, "scene=送別&price_band=5000plus")
    assert "P04" in under and "P04" not in mid + plus
    assert "P02" in mid and "P01" in mid and "P02" not in under + plus and "P01" not in under + plus
    assert "P05" in plus and "P05" not in under + mid


# SP-01 / I-31: 価格帯・シーンの不正は 422。DB から取らない
@pytest.mark.parametrize("band", ["3000_4999", "UNDER3000", "abc", "4500"])
def test_invalid_band(fd1_api: TestClient, band: str) -> None:
    db = main.app.dependency_overrides[get_db]()
    before = db.calls
    r = fd1_api.get("/api/candidates", params={"scene": "送別", "price_band": band})
    assert (r.status_code, r.json()["error"]["code"]) == (422, "invalid_price_band")
    assert db.calls == before


def test_invalid_scene(fd1_api: TestClient) -> None:
    r = fd1_api.get("/api/candidates", params={"scene": "取引先", "price_band": "under3000"})
    assert (r.status_code, r.json()["error"]["code"]) == (422, "invalid_scene")


# SP-10 / SP-11 / I-32: 一覧 API の形（12 件・total 30・page_size 12・項目）
def test_products_list_shape(fd9_api: TestClient) -> None:
    r = fd9_api.get("/api/products", params={"scene": "送別", "price_band": "3000to4999", "page": "1"})
    b = r.json()
    assert r.status_code == 200 and (b["count"], b["total"], b["page"], b["page_size"]) == (12, 30, 1, 12)
    want = {"product_id", "name", "price", "category", "rating", "review_count", "delivery_days", "wrapping", "high_rating"}
    assert all(set(i) == want for i in b["items"])
    assert "Y5" not in [i["product_id"] for i in b["items"]]


# SP-10 / SP-11 / I-33: 条件なしは total 34 で 12 / 12 / 10。該当なしは 200・空。page=99 は 1 ページ目
def test_products_paging_and_empty(fd9_api: TestClient) -> None:
    sizes = [fd9_api.get("/api/products", params={"page": str(p)}).json() for p in (1, 2, 3)]
    assert [s["count"] for s in sizes] == [12, 12, 10] and sizes[0]["total"] == 34
    e = fd9_api.get("/api/products", params={"scene": "誕生日", "price_band": "under3000"})
    assert e.status_code == 200 and e.json()["items"] == [] and e.json()["total"] == 0
    assert fd9_api.get("/api/products", params={"page": "99"}).json()["page"] == 1


# SP-10 / SP-11 / I-35: DB の失敗は 500 internal_error。本文に接続情報・例外の詳細が無い
def test_products_db_failure() -> None:
    def broken() -> Any:
        raise RuntimeError("host=secret-host user=secret-user password=secret-pass")

    main.app.dependency_overrides[get_db] = lambda: Db(connect=broken)
    try:
        for path in ("/api/products?scene=送別", "/api/candidates?scene=送別"):
            r = TestClient(main.app).get(path)
            assert (r.status_code, r.json()["error"]["code"]) == (500, "internal_error")
            assert not any(w in r.text for w in ("secret", "RuntimeError", "Traceback", "password"))
    finally:
        main.app.dependency_overrides.clear()


# E-13 / I-35: 11 秒かかる DB は約 10 秒で打ち切り、候補取得・絞り込みとも 500 internal_error
def test_candidates_and_products_timeout() -> None:
    def slow() -> Any:
        time.sleep(11)
        raise RuntimeError("late")

    main.app.dependency_overrides[get_db] = lambda: Db(connect=slow)
    try:
        for path in ("/api/candidates?scene=送別", "/api/products?scene=送別"):
            t0 = time.monotonic()
            r = TestClient(main.app).get(path)
            took = time.monotonic() - t0
            assert (r.status_code, r.json()["error"]["code"]) == (500, "internal_error")
            assert 9.5 <= took < 11, took
    finally:
        main.app.dependency_overrides.clear()
    time.sleep(1.5)


# SP-01 / SP-02 / I-40: シーン＋カテゴリー。order は絞った商品だけで付ける
def test_candidates_scene_and_category() -> None:
    from candidates_support import product

    items = [
        product("C1", "送別", 1, 4000, 4.5, 20, days=2, wrap=1, category="食品"),
        product("C3", "送別", 1, 4000, 4.5, 20, days=2, wrap=1, category="酒類"),
        product("C4", "送別", 0, 4000, 4.5, 20, days=2, wrap=1, category="食品"),
    ]
    for client in client_for(CandidateDb(items, {})):
        assert ids(client, "scene=送別&category=食品") == ["C1"]
        assert set(ids(client, "scene=送別")) == {"C1", "C3"}
        assert set(ids(client, "scene=送別&category=食品&category=酒類")) == {"C1", "C3"}
