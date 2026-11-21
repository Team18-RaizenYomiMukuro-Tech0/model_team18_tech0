# NF-54（#303）: 一覧（#404）に続けて、詳細・声・似た商品・共有ページの開く API の 200 にも Server-Timing（数値だけ）。
# 起動したての回か分けられるように（印のない回は免除しない決まり）。422・404・410 には付けない。DB には繋がない。
import re
from collections.abc import Iterator
from datetime import timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from test_product_detail import DetailDb
from test_products_filter import client_for, fd1
from test_share_create import Backend, create
from test_share_get import fake, get, set_clock  # noqa: F401  (fake はフィクスチャ)
from test_voices_similar import ExtrasDb

METRICS = ("db_wait", "db_connect", "db_sql", "db_total", "total")
FORBIDDEN = r"select|giftia|products|password|error|P01|share|description"


@pytest.fixture
def client() -> Iterator[TestClient]:
    yield from client_for(DetailDb())


def check(headers: Any) -> None:
    h = headers["server-timing"]
    for name in METRICS:
        assert re.search(rf"\b{name};dur=\d+(\.\d+)?\b", h)
    assert re.search(r'proc;desc="pid=\d+ up=\d+ warm=-?\d+ nth=\d+"', h)
    assert re.search(r'conn;desc="new=\d reused=\d retry=\d"', h)
    assert not re.search(FORBIDDEN, h, re.IGNORECASE)


def test_detail_has_timing(client: TestClient) -> None:
    for query in ("", "?scene=送別"):
        r = client.get(f"/api/products/P01{query}")
        assert r.status_code == 200
        check(r.headers)


def test_voices_and_similar_have_timing() -> None:
    for extras in client_for(ExtrasDb(fd1(), [("P01", 5, "とても喜ばれました", "2026-10-01")])):
        r = extras.get("/api/products/P01/voices")
        assert r.status_code == 200 and r.json()["voices"]
        check(r.headers)
        r = extras.get("/api/products/P01/similar?scene=送別")
        assert r.status_code == 200
        check(r.headers)
        r = extras.get("/api/products/Z99/similar?scene=送別")  # 404 には付けない
        assert r.status_code == 404 and "server-timing" not in r.headers


def test_errors_have_no_timing(client: TestClient) -> None:
    for url in (
        "/api/products/abc",  # 形式違い 422
        "/api/products/P01?scene=取引先",  # 422
        "/api/products/Z99",  # 404
        "/api/products/abc/voices",
        "/api/products/P01/similar",  # scene なし 422
        "/api/products/Z99/similar?scene=送別",  # 404
    ):
        r = client.get(url)
        assert r.status_code in (404, 422), url
        assert "server-timing" not in r.headers, url


def test_share_page_has_timing_only_on_200(fake: Backend) -> None:  # noqa: F811  fake は import したフィクスチャを引数で受けるため、再定義に見える
    link = create(fake.ids[:2])["share_id"]
    r = get(link)
    assert r.status_code == 200
    check(r.headers)
    assert link not in r.headers["server-timing"]  # リンクの ID は入らない
    assert "server-timing" not in get("A" * 22).headers  # 該当なし 404
    set_clock(timedelta(days=31))
    r = get(link)
    assert r.status_code == 410 and "server-timing" not in r.headers
