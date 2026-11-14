# 完了条件 #6（I-01〜I-05、設計.md D-01・DATA-01）: 班の DB（giftia_t501 のダミーデータ）を読む。SELECT だけ。
# backend/.env の接続情報が無い環境（CI など）では飛ばす。
import os

import pytest
from dotenv import load_dotenv
from fastapi.testclient import TestClient

import main

load_dotenv()
HAS_ENV = all(os.environ.get(k) for k in ("GIFTIA_DB_HOST", "GIFTIA_DB_USER", "GIFTIA_DB_PASSWORD"))
pytestmark = pytest.mark.skipif(not HAS_ENV, reason=".env に接続情報が無いので飛ばす")


@pytest.fixture
def client() -> TestClient:
    return TestClient(main.app)


def test_scene_and_band(client: TestClient) -> None:
    """I-02: 送別・3,000〜4,999 円で、最大 10 件、全件が価格の範囲内"""
    r = client.get("/api/candidates", params={"scene": "送別", "price_band": "3000to4999"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert 1 <= body["count"] <= 10 and body["count"] == len(body["items"])
    for i in body["items"]:
        assert 3000 <= i["price"] <= 4999
        assert set(i) == {"product_id", "name", "price", "category", "high_rating", "reason"}


def test_empty_combination(client: TestClient) -> None:
    """I-03・I-28: 該当なしの組み合わせは 200 で items:[]（products の確認で 0 件と分かった組み合わせ）"""
    r = client.get("/api/candidates", params={"scene": "お礼", "price_band": "under3000", "category": "家電"})
    assert r.status_code == 200 and {k: v for k, v in r.json().items() if k != "relax"} == {"items": [], "count": 0} and "relax" in r.json()  # 0 件には助け舟の件数 relax がつく（D-44）


def test_sendoff_count_matches_a_separate_count(client: TestClient) -> None:
    """I-05: 理由の送別回数は、注文データから別に数え直した値と一致する（読み取りのみ）"""
    from db import get_db

    r = client.get("/api/candidates", params={"scene": "送別", "price_band": "3000to4999"})
    assert r.status_code == 200
    top = r.json()["items"][0]
    rows = get_db().fetch_all(
        "SELECT COUNT(*) AS n FROM order_items oi JOIN orders o ON o.order_id = oi.order_id "
        "WHERE o.estimated_scene = %s AND o.ship_to_type = %s AND oi.product_id = %s",
        ("送別", "会社", top["product_id"]),
    )
    n = int(rows[0]["n"])
    if n >= 1:
        assert f"{n}回" in top["reason"]
    else:
        assert "まだありません" in top["reason"]
