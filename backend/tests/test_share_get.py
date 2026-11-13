# 完了条件 #2〜#6（共有リンクを開く API。仕様 SP-06、設計 D-06・D-11、DATA-02）
# 偽の DB（メモリ上の SQLite。本物と同じ SQL を流す）が基本。test_expiry・test_order は班の DB でも流し、届かなければ skip する。
# 班の DB のテストの行は、作成 API を印あり（is_test=1）で呼んで作る。後片付けは手順書のとおり、配られたアカウントで。
import json
import time
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from test_share_create import Backend, FakeShareDb, create, make_fake, make_real

import main
from clock import Clock, get_clock
from db import Db, get_db
from share_mark import get_test_mark

T0 = datetime(2026, 11, 1, 12, 0, 0, tzinfo=UTC)  # リンクを作った時刻（固定）
SECOND = timedelta(seconds=1)
H720 = timedelta(hours=720)


class FixedClock(Clock):
    """固定の時計（D-11）。テストのコードの中でだけ差し替える"""

    def __init__(self, now: datetime) -> None:
        self._now = now

    def now(self) -> datetime:
        return self._now


def set_clock(delta: timedelta) -> None:
    """時計を「作った時刻 + delta」にする"""
    main.app.dependency_overrides[get_clock] = lambda: FixedClock(T0 + delta)


def _serve(b: Backend) -> Iterator[Backend]:
    app = main.app
    app.dependency_overrides[get_db] = lambda: b.db
    app.dependency_overrides[get_test_mark] = lambda: 1  # テストの行は印あり（D-19）
    set_clock(timedelta(0))
    try:
        yield b
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def fake() -> Iterator[Backend]:
    yield from _serve(make_fake())


@pytest.fixture(params=["fake", "real"])
def backend(request: pytest.FixtureRequest) -> Iterator[Backend]:
    yield from _serve(make_fake() if request.param == "fake" else make_real())


def get(share_id: str) -> Any:
    return TestClient(main.app, raise_server_exceptions=False).get(f"/api/share-links/{share_id}")


def fake_db(b: Backend) -> FakeShareDb:
    assert isinstance(b.db, FakeShareDb)
    return b.db


# SP-06 D-06 D-11 I-09 I-10 I-12 I-20 I-23
def test_expiry(backend: Backend) -> None:
    link = create(backend.ids[:2])["share_id"]
    for delta in (timedelta(0), H720 - SECOND, H720):  # 719 時間 59 分 59 秒と 720 時間ちょうどは有効
        set_clock(delta)
        r = get(link)
        assert r.status_code == 200, (delta, r.text)
        assert [i["product_id"] for i in r.json()["items"]] == backend.ids[:2]
    for delta in (H720 + SECOND, timedelta(days=31)):  # 720 時間 0 分 1 秒と 31 日は期限切れ。商品は返さない
        set_clock(delta)
        r = get(link)
        assert r.status_code == 410
        assert r.json() == {"error": {"code": "expired", "message": "このリンクは期限切れです"}}
    if backend.name != "fake":
        return
    # I-20: 期限切れで、販売終了の商品を含む行でも 410。商品も「販売終了」も返らず、商品テーブルも見ない
    db = fake_db(backend)
    db.raw.execute("DELETE FROM products WHERE product_id = ?", (backend.ids[0],))
    before = len(db.reads)
    r = get(link)
    assert r.status_code == 410 and "discontinued" not in r.text and "items" not in r.json()
    assert all("products" not in s for s in db.reads[before:])
    set_clock(timedelta(0))
    body = get(link).json()
    assert (body["created_at"], body["expires_at"]) == ("2026-11-01T12:00:00Z", "2026-12-01T12:00:00Z")


# SP-06 D-06 NF-06 I-11
def test_not_found(fake: Backend) -> None:
    db = fake_db(fake)
    link = create(fake.ids[:1])["share_id"]
    saved = db.raw.execute("SELECT share_id, items, created_at, is_test FROM share_links").fetchall()
    for missing in ("A" * 22, link.swapcase()):  # 形式は合うが該当なし（大文字と小文字は別の識別子）
        r = get(missing)
        assert (r.status_code, r.json()["error"]["code"]) == (404, "not_found")
    reads = len(db.reads)
    malformed = [
        link[:-1],  # 21 文字
        link + "x",  # 23 文字
        "!" * 22,  # 使えない文字
        "a b" + "c" * 19,
        "'" + "a" * 21,  # 引用符を含む 22 文字
        "' OR '1'='1",
        "abc'; DELETE FROM share_links;--",
        "a" * 21 + "é",
    ]
    for bad in malformed:
        r = get(bad)
        assert (r.status_code, r.json()["error"]["code"]) == (404, "not_found"), bad
    assert get("%20").status_code == 404  # 空白だけ
    assert get("").status_code in (404, 405)  # 空
    assert len(db.reads) == reads  # 形式が不正なときは DB への問い合わせが 0 回
    assert db.raw.execute("SELECT share_id, items, created_at, is_test FROM share_links").fetchall() == saved
    assert len(db.writes) == 1  # 書き込みは作成の 1 回だけ。取得では書かない


# SP-06 D-06 I-13 I-14
def test_product_status(fake: Backend) -> None:
    db = fake_db(fake)
    link = create(["P01", "P02", "P09"])["share_id"]
    stored = json.loads(db.raw.execute("SELECT items FROM share_links").fetchone()[0])
    saved = {i["product_id"]: i for i in stored}
    db.raw.execute("DELETE FROM products WHERE product_id = 'P02'")  # 販売終了（DB に無い）
    db.raw.execute("UPDATE products SET stock = 0 WHERE product_id = 'P09'")  # 在庫なし
    db.raw.execute("UPDATE products SET product_name = '改名', price = 1 WHERE product_id = 'P01'")  # 現在の値は違う
    r = get(link)
    assert r.status_code == 200
    got = {i["product_id"]: i for i in r.json()["items"]}
    assert {k: v["status"] for k, v in got.items()} == {"P01": "available", "P02": "discontinued", "P09": "out_of_stock"}
    for pid, item in got.items():  # どの状態でも、作成時点の名前・価格・理由が返る
        assert set(item) == {"product_id", "status", "name", "price", "reason"}
        assert (item["name"], item["price"], item["reason"]) == (saved[pid]["name"], saved[pid]["price"], saved[pid]["reason"])
    assert got["P01"]["name"] != "改名" and got["P01"]["price"] != 1  # 現在の DB の値ではない
    row = db.raw.execute("SELECT product_name, price FROM products WHERE product_id = 'P01'").fetchone()
    assert row == ("改名", 1)  # DB の商品は取得では書き換えない
    db.raw.execute("UPDATE products SET stock = NULL WHERE product_id = 'P01'")
    assert {i["product_id"]: i["status"] for i in get(link).json()["items"]}["P01"] == "out_of_stock"


# SP-06 D-05 D-06 I-26
def test_order(backend: Backend) -> None:
    a, b, c = backend.ids[:3]
    link = create([c, a, b])["share_id"]
    set_clock(timedelta(hours=1))
    r = get(link)
    assert r.status_code == 200
    assert [i["product_id"] for i in r.json()["items"]] == [c, a, b]


# SP-06 D-06 E-13 E-06 I-22
def test_failure(fake: Backend) -> None:
    link = create(fake.ids[:1])["share_id"]

    def broken() -> Any:
        raise RuntimeError("host=secret-host user=secret-user password=secret-pass")

    def slow() -> Any:
        time.sleep(11)
        return fake.connect()

    def leaks(text: str) -> bool:
        return any(w in text for w in ("secret", "RuntimeError", "Traceback", "password"))

    main.app.dependency_overrides[get_db] = lambda: Db(connect=broken)
    r = get(link)
    assert (r.status_code, r.json()["error"]["code"]) == (500, "internal_error")
    assert not leaks(r.text)
    main.app.dependency_overrides[get_db] = lambda: Db(connect=slow)
    started = time.monotonic()
    r = get(link)
    elapsed = time.monotonic() - started
    assert (r.status_code, r.json()["error"]["code"]) == (500, "internal_error")
    assert not leaks(r.text)
    assert 9.5 <= elapsed < 11, elapsed  # 約 10 秒で打ち切る
    time.sleep(1.5)  # 遅れて動いた分が済むのを待つ
