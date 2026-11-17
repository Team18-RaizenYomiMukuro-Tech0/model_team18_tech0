# NF-54（#303）: 起動したてのサーバーの最初の要求を速くする。
#  ① /api/products にも Server-Timing（候補取得と同じ。数値だけ）② main.py は DB の接続づくり（warm_up）を、重い部品の読み込みより前に始める。
# DB には繋がない。
import ast
import re
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from search_support import SearchDb

import main
from db import get_db

METRICS = ("db_wait", "db_connect", "db_sql", "db_total", "total")


@pytest.fixture(scope="module")
def db() -> SearchDb:
    return SearchDb()


@pytest.fixture
def client(db: SearchDb) -> Iterator[TestClient]:
    main.app.dependency_overrides[get_db] = lambda: db
    try:
        yield TestClient(main.app)
    finally:
        main.app.dependency_overrides.clear()


def test_products_has_server_timing_with_numbers_only(client: TestClient) -> None:
    for query in ("", "?scene=送別&price_band=3000to4999", "?q=紅茶", "?q=zzzzqqqq"):  # 0 件（助け舟つき）も同じ
        r = client.get(f"/api/products{query}")
        assert r.status_code == 200
        h = r.headers["server-timing"]
        for name in METRICS:
            assert re.search(rf"\b{name};dur=\d+(\.\d+)?\b", h)
        assert re.search(r'conn;desc="new=\d reused=\d retry=\d"', h)
        assert not re.search(r"select|giftia|products|password|error|紅茶|zzzz", h, re.IGNORECASE)  # 言葉も SQL も入らない（決定 18）


def test_products_422_has_no_timing(client: TestClient) -> None:
    r = client.get("/api/products?sort=xxx")
    assert r.status_code == 422 and "server-timing" not in r.headers


def test_main_starts_warm_up_before_heavy_imports() -> None:
    """warm_up() の呼び出しは、fastapi・api.*・logging_setup・publish の読み込みより前（接続づくりと読み込みを同時に進める）"""
    tree = ast.parse((Path(main.__file__)).read_text(encoding="utf-8"))
    warm_at = next(
        i for i, n in enumerate(tree.body)
        if isinstance(n, ast.Expr) and isinstance(n.value, ast.Call)
        and isinstance(n.value.func, ast.Name) and n.value.func.id == "warm_up"
    )
    heavy = ("fastapi", "api", "logging_setup", "publish", "dotenv")
    for i, n in enumerate(tree.body):
        mod = n.module if isinstance(n, ast.ImportFrom) else n.names[0].name if isinstance(n, ast.Import) else ""
        if (mod or "").split(".")[0] in heavy:
            assert i > warm_at, f"{mod} の読み込みが warm_up() より前です"
