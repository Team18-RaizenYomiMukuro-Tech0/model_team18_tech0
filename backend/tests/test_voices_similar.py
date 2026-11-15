# 贈った人の声と似た商品の API（仕様 SP-17・SP-25、設計 D-35・D-42。テスト設計 U-62〜U-66・U-78）
# DB は使わない（偽の DB。メモリ上の SQLite に本物と同じ SQL を流す）。班の DB は test_voices_similar_db.py。
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from test_products_filter import SpyDb, client_for, product

from db import Db, DbError

REVIEWS_SCHEMA = (
    "CREATE TABLE reviews (review_id TEXT PRIMARY KEY, product_id TEXT, user_id TEXT, "
    "rating INTEGER, comment TEXT, posted_at TEXT)"
)
ITEM_FIELDS = {
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

Review = tuple[str, int, str | None, str]  # (product_id, 星, 本文, 投稿日)


class ExtrasDb(SpyDb):
    """商品とシーンのタグに、声（reviews）を足した偽の DB。呼ばれた回数と流れた SQL を覚える"""

    def __init__(self, products: list[dict[str, Any]], reviews: list[Review] | None = None) -> None:
        super().__init__(products)
        self.raw.execute(REVIEWS_SCHEMA)
        for n, (pid, rating, comment, posted) in enumerate(reviews or [], 1):
            self.raw.execute(
                "INSERT INTO reviews VALUES (?,?,?,?,?,?)", (f"R{n:05d}", pid, f"U{n:05d}", rating, comment, posted)
            )
        self.sqls: list[str] = []

    def fetch_all(self, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        self.sqls.append(sql)
        return super().fetch_all(sql, params)


class BrokenDb(Db):
    def fetch_all(self, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        raise DbError("OperationalError")


def voices_of(client: TestClient, pid: str) -> list[dict[str, Any]]:
    r = client.get(f"/api/products/{pid}/voices")
    assert r.status_code == 200, r.text
    body = r.json()
    assert set(body) == {"voices"}
    voices: list[dict[str, Any]] = body["voices"]
    return voices


def serve(db: Db) -> Iterator[TestClient]:
    yield from client_for(db)


# ---- 贈った人の声（D-35） ----


# SP-17 D-35 U-62
def test_voices_rating_four_or_more() -> None:
    reviews: list[Review] = [("V1", 3, "ふつうでした", "2026-01-01"), ("V1", 4, "よかったです", "2026-01-02")]
    for client in serve(ExtrasDb([product("V1", "送別", 1, 3000, 4.0, 2)], reviews)):
        assert voices_of(client, "V1") == [{"text": "よかったです", "rating": 4}]


# SP-17 D-35 U-63
def test_voices_need_a_comment() -> None:
    reviews: list[Review] = [
        ("V2", 5, None, "2026-01-01"),
        ("V2", 5, "", "2026-01-02"),
        ("V2", 5, "   ", "2026-01-03"),
    ]
    for client in serve(ExtrasDb([product("V2", "送別", 1, 3000, 4.0, 3)], reviews)):
        assert voices_of(client, "V2") == []  # NULL・空文字・空白だけの本文はどれも入らない


# SP-17 D-35 U-64
def test_voices_same_text_once_newest() -> None:
    reviews: list[Review] = [("V3", 4, "同じ文", "2026-01-01"), ("V3", 5, "同じ文", "2026-02-01"), ("V3", 4, "別の文", "2026-01-15")]
    for client in serve(ExtrasDb([product("V3", "送別", 1, 3000, 4.0, 3)], reviews)):
        got = voices_of(client, "V3")
        assert [v["text"] for v in got] == ["同じ文", "別の文"]  # 同じ文は新しい方 1 件（2/1 が先）
        assert sum(1 for v in got if v["text"] == "同じ文") == 1


# SP-17 D-35 U-65
def test_voices_two_newest_then_text_order() -> None:
    reviews: list[Review] = [
        ("V4", 4, "古い声", "2025-12-01"),
        ("V4", 5, "いちばん新しい声", "2026-03-01"),
        ("V4", 4, "b同じ日の声", "2026-02-01"),
        ("V4", 4, "a同じ日の声", "2026-02-01"),
        ("V4", 5, "もっと古い声", "2025-01-01"),
    ]
    for client in serve(ExtrasDb([product("V4", "送別", 1, 3000, 4.0, 5)], reviews)):
        assert [v["text"] for v in voices_of(client, "V4")] == ["いちばん新しい声", "a同じ日の声"]
    reviews_same_day: list[Review] = [("V4", 4, "b声", "2026-02-01"), ("V4", 4, "a声", "2026-02-01"), ("V4", 4, "c声", "2026-02-01")]
    for client in serve(ExtrasDb([product("V4", "送別", 1, 3000, 4.0, 3)], reviews_same_day)):
        assert [v["text"] for v in voices_of(client, "V4")] == ["a声", "b声"]  # 同じ日は本文の文字の順


# SP-17 D-35 N-13 U-66
def test_voices_zero_and_two_hide_who_wrote_them() -> None:
    reviews: list[Review] = [("V6", 4, "一つ目", "2026-01-01"), ("V6", 5, "二つ目", "2026-01-02")]
    products = [product("V5", "送別", 1, 3000, 4.0, 0), product("V6", "送別", 1, 3000, 4.0, 2)]
    for client in serve(ExtrasDb(products, reviews)):
        assert voices_of(client, "V5") == []  # 0 件は空の配列
        got = voices_of(client, "V6")
        assert len(got) == 2
        for v in got:
            assert set(v) == {"text", "rating"}  # user_id・review_id・posted_at は入らない
        assert [v["rating"] for v in got] == [5, 4]


# SP-17 D-35
def test_voices_unknown_product_is_empty_and_bad_id_is_422() -> None:
    db = ExtrasDb([product("V1", "送別", 1, 3000, 4.0, 0)])
    for client in serve(db):
        assert voices_of(client, "Z9999") == []  # 商品が無くても 404 にしない（404 は D-29）
        calls = len(db.sqls)
        for bad in ("abc", "1", "g0001", "G" + "1" * 10, "G12-3", "%27%20OR%20%271%27%3D%271"):
            r = client.get(f"/api/products/{bad}/voices")
            assert (r.status_code, r.json()["error"]["code"]) == (422, "invalid_product_id"), bad
        assert len(db.sqls) == calls  # 形式が不正なときは DB を呼ばない


# SP-17 D-35 N-04 N-13
def test_voices_sql_is_read_only_and_never_reads_user() -> None:
    db = ExtrasDb([product("V1", "送別", 1, 3000, 4.0, 1)], [("V1", 5, "声", "2026-01-01")])
    for client in serve(db):
        voices_of(client, "V1")
        sql = db.sqls[-1]
        assert sql.lstrip().upper().startswith("SELECT") and "user_id" not in sql and "review_id" not in sql
        assert "'" not in sql.replace("<> ''", "") and "%s" in sql  # 値は SQL に書かず、すべて %s


# D-35 E-06
def test_voices_db_failure_is_500() -> None:
    for client in serve(BrokenDb()):
        r = TestClient(client.app, raise_server_exceptions=False).get("/api/products/V1/voices")
        assert (r.status_code, r.json()["error"]["code"]) == (500, "internal_error")
        assert "OperationalError" not in r.text


# ---- 似た商品（D-42） ----


def catalog() -> list[dict[str, Any]]:
    """開いている商品 O（送別・4,000 円）と、同じシーン・同じ価格帯の 5 件、外れる商品"""
    return [
        product("O1", "送別", 1, 4000, 4.0, 10),
        product("A1", "送別", 1, 4500, 4.8, 10),
        product("B1", "送別", 1, 3000, 4.8, 50),  # 評価が A1 と同じで件数が多い → A1 より先
        product("C1", "送別", 1, 4999, 4.9, 5),
        product("E1", "送別", 1, 3500, 4.2, 100),
        product("F1", "送別", 1, 3600, None, None),  # 評価なしは後ろ
        product("S1", "誕生日", 1, 4000, 5.0, 100),  # シーンが違う
        product("L1", "送別", 1, 2999, 5.0, 100),  # 価格帯が違う（2,999）
        product("H1", "送別", 1, 5000, 5.0, 100),  # 価格帯が違う（5,000）
        product("Z1", "送別", 0, 4000, 5.0, 100),  # 在庫 0
    ]


def similar(client: TestClient, pid: str, query: str = "scene=送別") -> tuple[int, dict[str, Any]]:
    r = client.get(f"/api/products/{pid}/similar?{query}")
    return r.status_code, r.json()


# SP-25 D-42 U-78
def test_similar_picks_and_orders() -> None:
    for client in serve(ExtrasDb(catalog())):
        status, body = similar(client, "O1")
        assert status == 200
        assert [i["product_id"] for i in body["items"]] == ["C1", "B1", "A1"]  # 評価 → 件数 → 商品 ID。最大 3 件
        for item in body["items"]:
            assert set(item) == ITEM_FIELDS  # D-28 の 1 件分（arrives_on を含む）
            assert item["scene_count"] is None
            assert item["arrives_on"] is not None


# SP-25 D-42 U-78
def test_similar_order_rules_and_unrated_last() -> None:
    items = [
        product("O1", "送別", 1, 4000, 4.0, 10),
        product("T2", "送別", 1, 4100, 4.5, 20),
        product("T1", "送別", 1, 4200, 4.5, 20),  # 評価も件数も同じ → 商品 ID 順
        product("U1", "送別", 1, 4300, None, None),  # 評価なしは最後
    ]
    for client in serve(ExtrasDb(items)):
        assert [i["product_id"] for i in similar(client, "O1")[1]["items"]] == ["T1", "T2", "U1"]


# SP-25 D-42 U-78
def test_similar_price_band_follows_the_opened_product() -> None:
    items = [
        product("O2", "送別", 1, 2999, 4.0, 10),
        product("P1", "送別", 1, 1000, 4.0, 1),
        product("P2", "送別", 1, 3000, 4.9, 1),  # 3,000 円は別の帯
        product("O3", "送別", 1, 5000, 4.0, 10),
        product("P3", "送別", 1, 99999, 4.0, 1),
    ]
    for client in serve(ExtrasDb(items)):
        assert [i["product_id"] for i in similar(client, "O2")[1]["items"]] == ["P1"]
        assert [i["product_id"] for i in similar(client, "O3")[1]["items"]] == ["P3"]


# SP-25 D-42 U-78
def test_similar_zero_is_empty_and_scene_decides_the_tag() -> None:
    items = [product("O1", "送別", 1, 4000, 4.0, 10), product("S1", "誕生日", 1, 4000, 5.0, 10)]
    for client in serve(ExtrasDb(items)):
        assert similar(client, "O1") == (200, {"items": []})  # 0 件は空の配列
        status, body = similar(client, "O1", "scene=誕生日")
        assert status == 200 and [i["product_id"] for i in body["items"]] == ["S1"]  # 選んだシーンのタグで選ぶ


# SP-25 D-42 I-51
def test_similar_errors_do_not_reach_the_db_before_validation() -> None:
    db = ExtrasDb(catalog())
    for client in serve(db):
        calls = len(db.sqls)
        for query in ("", "scene=", "scene=誕生日会", "scene=送別' OR '1'='1", "budget=4000"):
            status, body = similar(client, "O1", query)
            assert (status, body["error"]["code"]) == (422, "invalid_scene"), query
        for bad in ("abc", "1", "G" + "1" * 10, "o1"):
            status, body = similar(client, bad)
            assert (status, body["error"]["code"]) == (422, "invalid_product_id"), bad
        assert len(db.sqls) == calls  # 不正な入力は DB を呼ばない
        assert similar(client, "Z9999") == (404, {"error": {"code": "not_found", "message": "この商品は見つかりません"}})


# SP-25 D-42 N-04
def test_similar_sql_is_one_fixed_select() -> None:
    db = ExtrasDb(catalog())
    for client in serve(db):
        similar(client, "O1")
        assert all(s.lstrip().upper().startswith("SELECT") for s in db.sqls)
        assert "O1" not in db.sqls[-1] and "送別" not in db.sqls[-1] and "%s" in db.sqls[-1]


# D-42 E-06
def test_similar_db_failure_is_500() -> None:
    for client in serve(BrokenDb()):
        r = TestClient(client.app, raise_server_exceptions=False).get("/api/products/O1/similar?scene=送別")
        assert (r.status_code, r.json()["error"]["code"]) == (500, "internal_error")


@pytest.fixture(autouse=True)
def _no_leftover_overrides() -> Iterator[None]:
    yield
    import main

    main.app.dependency_overrides.clear()
