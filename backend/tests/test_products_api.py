# 完了条件 #3〜#5（U-41・U-42・U-18、I-34・I-37・I-38・I-39、NF-39、設計.md D-28）: API に直接送って応答を確かめる。
# DB は使わない（偽の DB。SQL は本物と同じ文を流す）。
from typing import Any

import pytest
from fastapi.testclient import TestClient
from test_products_filter import SpyDb, client_for, fd9, product

FD10 = [  # FD-10（カテゴリー）。C4 は在庫 0
    product("C1", "送別", 1, 3200, 4.0, 10, category="食品"),
    product("C2", "誕生日", 1, 4000, 4.0, 10, category="食品"),
    product("C3", "送別", 1, 5500, 4.0, 10, category="酒類"),
    product("C4", "送別", 0, 3500, 4.0, 10, category="食品"),
    product("C5", "誕生日", 1, 2500, 4.0, 10, category="コスメ"),
]
ALL_CATEGORIES = [
    "生活雑貨",
    "食品",
    "コスメ",
    "飲料",
    "家電",
    "インテリア",
    "ビジネス小物",
    "フラワー",
    "酒類",
    "カタログギフト",
]

Params = list[tuple[str, str]]


def get(client: TestClient, params: Params) -> tuple[int, dict[str, Any]]:
    r = client.get("/api/products", params=params)
    return r.status_code, r.json()


@pytest.fixture
def fd9_db() -> SpyDb:
    return SpyDb(fd9())


def test_paging(fd9_db: SpyDb) -> None:
    """U-41: 送別＋3000to4999（30件）を 12 / 12 / 6。範囲外は 1 ページ目。重複 0・欠落 0"""
    base: Params = [("scene", "送別"), ("price_band", "3000to4999")]
    for client in client_for(fd9_db):
        seen: list[str] = []
        for page, size in ((1, 12), (2, 12), (3, 6)):
            _, body = get(client, [*base, ("page", str(page))])
            items = body["items"]
            assert isinstance(items, list)
            assert (len(items), body["count"], body["page"]) == (size, size, page)
            assert (body["total"], body["page_size"]) == (30, 12)
            seen += [i["product_id"] for i in items]
        assert len(seen) == len(set(seen)) == 30
        _, first = get(client, [*base, ("page", "1")])
        for page in (4, 99):
            _, body = get(client, [*base, ("page", str(page))])
            assert body["page"] == 1 and body["count"] == 12
            assert body["items"] == first["items"]
        for bad in ("0", "-1", "abc", "1.5"):
            status, body = get(client, [("page", bad)])
            assert status == 422 and body["error"]["code"] == "invalid_page"
        status, none = get(client, [("scene", "誕生日"), ("price_band", "under3000")])
        assert status == 200 and (none["items"], none["total"], none["page"]) == (
            [],
            0,
            1,
        )


def test_null() -> None:
    """U-42・U-18・I-37: 欠けた項目は null。高評価は 4.5 以上だけ（4.49 は false、評価なしは false）"""
    data = [
        product("N1", "送別", 1, 3000, None, None, days=None, wrap=None),  # 全部欠損
        product("N2", "送別", 1, 3000, 5.0, None),  # 件数だけ無い
        product("N3", "送別", 1, 3000, None, 5),  # 評価だけ無い
        product("R45", "送別", 1, 3000, 4.5, 10),
        product("R47", "送別", 1, 3000, 4.7, 10),
        product("R449", "送別", 1, 3000, 4.49, 10),
        product("R43", "送別", 1, 3000, 4.3, 10),
    ]
    for client in client_for(SpyDb(data)):
        status, body = get(client, [("scene", "送別")])
        assert status == 200
        items = {i["product_id"]: i for i in body["items"]}
        n1 = items["N1"]
        assert (
            n1["rating"],
            n1["review_count"],
            n1["delivery_days"],
            n1["wrapping"],
        ) == (None, None, None, None)
        assert n1["high_rating"] is False
        assert items["N2"]["review_count"] is None and items["N2"]["rating"] == 5.0
        assert items["N3"]["rating"] is None and items["N3"]["review_count"] == 5
        assert {k for k, v in items.items() if v["high_rating"]} == {"N2", "R45", "R47"}
        assert set(items["R45"]) == {
            "product_id", "name", "price", "category", "rating", "review_count", "delivery_days", "wrapping", "high_rating",
            "arrives_on", "scene_count",
        }  # fmt: skip


def test_invalid(fd9_db: SpyDb) -> None:
    """I-34・I-38・NF-39: 不正な値は 422（DB は呼ばない）。空の price_band・budget は無視。DB の行数は変わらない"""
    cases: list[tuple[Params, str]] = [
        ([("scene", "取引先")], "invalid_scene"),
        ([("scene", "送別' OR '1'='1")], "invalid_scene"),
        ([("price_band", "abc")], "invalid_price_band"),
        (
            [("price_band", "3000to4999; DROP TABLE share_links;--")],
            "invalid_price_band",
        ),
        ([("page", "0")], "invalid_page"),
        ([("page", "abc")], "invalid_page"),
        ([("page", "1 OR 1=1")], "invalid_page"),
        ([("page", "１")], "invalid_page"),
        ([("category", "お菓子")], "invalid_category"),
        ([("category", "食品 ")], "invalid_category"),
        ([("category", "ｼｮｸﾋﾝ")], "invalid_category"),
        ([("category", "食品"), ("category", "お菓子")], "invalid_category"),
    ]
    for client in client_for(fd9_db):
        before = fd9_db.row_count()
        for params, code in cases:
            status, body = get(client, params)
            assert status == 422, params
            assert body["error"]["code"] == code, params
        assert fd9_db.calls == 0  # 不正な要求は DB を呼ばない
        _, base = get(client, [("scene", "送別")])
        for extra in (
            [("price_band", "")],
            [("page", "")],
            [("budget", "4500")],
            [("budget", "")],
            [("price_band", ""), ("budget", "4500")],
        ):
            status, body = get(client, [("scene", "送別"), *extra])
            assert status == 200 and body == base, extra
        assert fd9_db.row_count() == before
        # 空の scene= は指定なし、空の page= は 1 ページ目（キックオフ記録 80）
        _, everything = get(client, [])
        assert get(client, [("scene", "")]) == (200, everything)
        assert get(client, [("page", "")]) == (200, everything)
        assert get(client, [("scene", ""), ("page", "")]) == (200, everything)
    check_category()  # カテゴリーの OR・重なり・空の扱い（完了条件 #5）


def total(client: TestClient, params: Params) -> int:
    status, body = get(client, params)
    assert status == 200, params
    return int(body["total"])


def check_category() -> None:
    """I-39: カテゴリーは選んだどれか（OR）。シーン・価格帯とは AND。重なり・全部・空の扱い"""
    for client in client_for(SpyDb(FD10)):

        def cat(*names: str) -> Params:
            return [("category", n) for n in names]

        status, body = get(client, cat("食品"))
        assert status == 200 and body["total"] == 2
        assert {i["category"] for i in body["items"]} == {"食品"}
        assert total(client, [*cat("食品"), ("scene", "送別")]) == 1
        assert total(client, [*cat("酒類"), ("scene", "誕生日")]) == 0
        assert total(client, cat("食品", "酒類")) == 3
        assert total(client, [*cat("食品", "酒類"), ("price_band", "5000plus")]) == 1
        assert total(client, [*cat("食品", "コスメ"), ("scene", "誕生日")]) == 2
        assert total(client, cat("食品", "食品")) == 2
        assert total(client, cat(*ALL_CATEGORIES)) == total(client, []) == 4
        assert total(client, cat("食品", "")) == 2
        assert (
            total(client, cat(""))
            == total(client, cat("  "))
            == total(client, cat("　"))
            == total(client, cat("", ""))
            == 4
        )


def test_category() -> None:
    check_category()
