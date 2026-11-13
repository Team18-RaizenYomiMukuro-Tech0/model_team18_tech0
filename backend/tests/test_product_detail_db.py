# 完了条件 #3（I-36、設計.md D-29）: 班の DB（giftia_t501 のダミーデータ）を読む。SELECT だけ。
# backend/.env の接続情報が無い環境（CI など）では飛ばす。
import os

import pytest
from dotenv import load_dotenv
from fastapi.testclient import TestClient

import main
from db import Db

load_dotenv()
HAS_ENV = all(os.environ.get(k) for k in ("GIFTIA_DB_HOST", "GIFTIA_DB_USER", "GIFTIA_DB_PASSWORD"))
pytestmark = pytest.mark.skipif(not HAS_ENV, reason=".env に接続情報が無いので飛ばす")


# SP-12 SP-14 D-29 I-36
def test_detail_matches_db() -> None:
    rows = Db().fetch_all(
        "SELECT product_id, product_name, price, category, stock, description, size "
        "FROM products ORDER BY product_id LIMIT 1"
    )
    assert len(rows) == 1
    row = rows[0]
    r = TestClient(main.app).get(f"/api/products/{row['product_id']}")
    assert r.status_code == 200
    body = r.json()
    assert (body["product_id"], body["name"], body["price"], body["category"]) == (
        row["product_id"],
        row["product_name"],
        row["price"],
        row["category"],
    )
    assert body["status"] == ("available" if row["stock"] is not None and row["stock"] >= 1 else "out_of_stock")
    assert body["description"] == (row["description"] or None)
    assert body["size"] == (row["size"] or None)
