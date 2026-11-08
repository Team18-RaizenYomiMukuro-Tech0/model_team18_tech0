# 完了条件 #6（I-32・I-33・I-35、設計.md D-28）: 班の DB（giftia_t501 のダミーデータ）を読む。SELECT だけ。
# backend/.env の接続情報が無い環境（CI など）では飛ばす。
import os

import pytest
from dotenv import load_dotenv
from fastapi.testclient import TestClient

import main

load_dotenv()
HAS_ENV = all(
    os.environ.get(k)
    for k in ("GIFTIA_DB_HOST", "GIFTIA_DB_USER", "GIFTIA_DB_PASSWORD")
)
pytestmark = pytest.mark.skipif(not HAS_ENV, reason=".env に接続情報が無いので飛ばす")

FIELDS = {
    "product_id",
    "name",
    "price",
    "category",
    "rating",
    "review_count",
    "delivery_days",
    "wrapping",
    "high_rating",
}


@pytest.fixture
def client() -> TestClient:
    return TestClient(main.app)


def test_scene_and_band(client: TestClient) -> None:
    r = client.get(
        "/api/products",
        params={"scene": "送別", "price_band": "3000to4999", "page": "1"},
    )
    assert r.status_code == 200
    body = r.json()
    assert (
        len(body["items"]) == 12
        and body["count"] == 12
        and body["page"] == 1
        and body["page_size"] == 12
    )
    assert body["total"] >= 12
    for item in body["items"]:
        assert set(item) == FIELDS
        assert 3000 <= item["price"] <= 4999


def test_category(client: TestClient) -> None:
    r = client.get("/api/products", params={"category": "食品"})
    assert r.status_code == 200
    body = r.json()
    assert body["total"] > 0 and body["items"]
    assert {i["category"] for i in body["items"]} == {"食品"}


def test_no_match_is_empty_not_error(client: TestClient) -> None:
    """条件に合う商品が無い組み合わせは、エラーではなく 200 で items:[]・total:0（班の DB で 0 件と確認した組み合わせ）"""
    r = client.get(
        "/api/products",
        params={"scene": "お礼", "price_band": "under3000", "category": "家電"},
    )
    assert r.status_code == 200
    body = r.json()
    assert (body["items"], body["total"], body["count"], body["page"]) == ([], 0, 0, 1)
