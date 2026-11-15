# 贈った人の声と似た商品の API（I-43 の声の部分・I-44・I-51、設計 D-35・D-42）: 班の DB（giftia_t501 のダミーデータ）を読む。SELECT だけ。
# 期待する値は、API の SQL とは別に手で書いた SELECT の結果から Python で組み立てる。
# backend/.env の接続情報が無い環境（CI など）では飛ばす。
import os
from typing import Any

import pytest
from dotenv import load_dotenv
from fastapi.testclient import TestClient

import main
from db import Db

load_dotenv()
HAS_ENV = all(os.environ.get(k) for k in ("GIFTIA_DB_HOST", "GIFTIA_DB_USER", "GIFTIA_DB_PASSWORD"))
pytestmark = pytest.mark.skipif(not HAS_ENV, reason=".env に接続情報が無いので飛ばす")

GIFT_SET = "G4271"  # お花とお菓子のセット（デモ用。声が 2 件ある。指示書 4.5）


@pytest.fixture
def client() -> TestClient:
    return TestClient(main.app)


@pytest.fixture
def db() -> Db:
    return Db()


def expected_voices(db: Db, pid: str) -> list[dict[str, Any]]:
    """手で書いた SELECT（条件に合う声を全部取る）から、同じ文を 1 回にして新しい順に 2 件"""
    rows = db.fetch_all(
        "SELECT comment, rating, posted_at FROM reviews "
        "WHERE product_id = %s AND rating >= 4 AND comment IS NOT NULL AND TRIM(comment) <> ''",
        (pid,),
    )
    newest: dict[str, tuple[Any, int]] = {}
    for r in rows:
        text = str(r["comment"])
        prev = newest.get(text)
        posted = r["posted_at"]
        rating = int(r["rating"])
        newest[text] = (posted, rating) if prev is None else (max(prev[0], posted), max(prev[1], rating))
    ordered = sorted(newest.items(), key=lambda kv: (-kv[1][0].toordinal(), kv[0]))
    return [{"text": t, "rating": v[1]} for t, v in ordered[:2]]


# SP-17 D-35 I-43 I-44
def test_voices_gift_set_has_two(client: TestClient, db: Db) -> None:
    r = client.get(f"/api/products/{GIFT_SET}/voices")
    assert r.status_code == 200
    voices = r.json()["voices"]
    assert len(voices) == 2  # G4271 は 2 件（デモ用）
    assert all(set(v) == {"text", "rating"} and v["rating"] >= 4 and v["text"].strip() for v in voices)
    assert voices == expected_voices(db, GIFT_SET)


# SP-17 D-35 I-44
def test_voices_none_is_empty(client: TestClient, db: Db) -> None:
    rows = db.fetch_all(
        "SELECT p.product_id FROM products p WHERE NOT EXISTS (SELECT 1 FROM reviews r WHERE r.product_id = p.product_id "
        "AND r.rating >= 4 AND r.comment IS NOT NULL AND TRIM(r.comment) <> '') ORDER BY p.product_id LIMIT 1"
    )
    assert rows, "条件に合う声が無い商品が見つからない"
    r = client.get(f"/api/products/{rows[0]['product_id']}/voices")
    assert (r.status_code, r.json()) == (200, {"voices": []})


# SP-17 D-35 I-43
def test_voices_match_hand_written_select(client: TestClient, db: Db) -> None:
    rows = db.fetch_all(
        "SELECT product_id FROM reviews WHERE rating >= 4 AND comment IS NOT NULL AND TRIM(comment) <> '' "
        "GROUP BY product_id HAVING COUNT(*) >= 3 ORDER BY product_id LIMIT 3"
    )
    assert rows
    for row in rows:
        pid = str(row["product_id"])
        assert client.get(f"/api/products/{pid}/voices").json()["voices"] == expected_voices(db, pid)


def band(price: int) -> tuple[int, int]:
    return (0, 2999) if price <= 2999 else (3000, 4999) if price <= 4999 else (5000, 2147483647)


# SP-25 D-42 I-51
def test_similar_matches_hand_written_select(client: TestClient, db: Db) -> None:
    opened = db.fetch_all(
        "SELECT p.product_id, p.price FROM products p JOIN product_scenes s ON s.product_id = p.product_id "
        "WHERE s.scene_tag = '送別' AND p.stock >= 1 ORDER BY p.product_id LIMIT 3"
    )
    assert opened
    for row in opened:
        pid, low_high = str(row["product_id"]), band(int(row["price"]))
        r = client.get(f"/api/products/{pid}/similar", params={"scene": "送別"})
        assert r.status_code == 200
        items = r.json()["items"]
        candidates = db.fetch_all(
            "SELECT p.product_id, p.rating, p.review_count FROM products p JOIN product_scenes s ON s.product_id = p.product_id "
            "WHERE s.scene_tag = '送別' AND p.stock >= 1 AND p.price >= %s AND p.price <= %s AND p.product_id <> %s",
            (*low_high, pid),
        )
        candidates.sort(key=lambda c: (c["rating"] is None, -(float(c["rating"]) if c["rating"] is not None else 0), -int(c["review_count"] or 0), c["product_id"]))
        assert len(items) == 3  # 似た商品が 3 件以上ある
        assert [i["product_id"] for i in items] == [c["product_id"] for c in candidates[:3]]
        assert pid not in [i["product_id"] for i in items]  # 開いた商品自身を含まない


# SP-25 D-42 I-51
def test_similar_errors(client: TestClient) -> None:
    for query, code in (("", "invalid_scene"), ("scene=誕生日会", "invalid_scene")):
        r = client.get(f"/api/products/G0001/similar?{query}")
        assert (r.status_code, r.json()["error"]["code"]) == (422, code)
    r = client.get("/api/products/abc/similar?scene=送別")
    assert (r.status_code, r.json()["error"]["code"]) == (422, "invalid_product_id")
    r = client.get("/api/products/Z9999999/similar?scene=送別")
    assert (r.status_code, r.json()["error"]["code"]) == (404, "not_found")
