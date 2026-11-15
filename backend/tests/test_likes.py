# いいね POST /api/share-links/{share_id}/likes と D-06 の like_count（仕様 SP-28・SP-06、設計 D-38・D-39、N-17）
# 対応するテスト: U-83（数え方）・I-52・I-53・I-54・I-55・I-60・NF-51。
# 偽の DB（メモリ上の SQLite）が基本。本物の DB では I-52 の流れを is_test=1 の共有リンクで流し、届かなければ skip する。
# 偽の DB は、MySQL の IF・GREATEST・ON DUPLICATE KEY UPDATE を SQLite の言い方に直して、同じ文を流す。
import json
import re
from collections.abc import Iterator
from datetime import timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from test_products_filter import FakeConn, FakeCursor
from test_share_create import Backend, FakeShareDb, create, make_real
from test_share_get import H720, SECOND, get, set_clock

import main
from config import SETTINGS
from db import Db, DbError, get_db
from share_mark import get_test_mark

LIMIT = SETTINGS.LIKE_MAX_PER_ITEM


def _to_sqlite(sql: str) -> str:
    sql = sql.replace("GREATEST(", "MAX(")
    sql = re.sub(r"ON DUPLICATE KEY UPDATE like_count = IF\(like_count < %s, like_count \+ 1, like_count\), updated_at = %s",
                 "ON CONFLICT(share_id, product_id) DO UPDATE SET like_count = CASE WHEN like_count < %s THEN like_count + 1 ELSE like_count END, updated_at = %s", sql)
    return sql


class _Cur(FakeCursor):
    def execute(self, sql: str, params: tuple[Any, ...] = ()) -> None:
        super().execute(_to_sqlite(sql), params)


class _Conn(FakeConn):
    def cursor(self) -> _Cur:
        return _Cur(self.conn)


class LikeDb(FakeShareDb):
    """共有リンクの偽の DB。書いた文（許可の検査を通ったもの）を覚える"""

    def __init__(self) -> None:
        super().__init__()
        self.like_writes: list[str] = []
        self._connect = lambda: _Conn(self.raw)

    def write(self, sql: str, params: tuple[Any, ...]) -> None:
        self.like_writes.append(sql)
        super().write(sql, params)

    def likes(self) -> list[tuple[Any, ...]]:
        return self.raw.execute("SELECT share_id, product_id, like_count FROM share_likes ORDER BY share_id, product_id").fetchall()


def make_like_fake() -> Backend:
    db = LikeDb()
    return Backend("fake", db, lambda: FakeConn(db.raw), ["P01", "P02", "P09"])


def _serve(b: Backend) -> Iterator[Backend]:
    app = main.app
    app.dependency_overrides[get_db] = lambda: b.db
    app.dependency_overrides[get_test_mark] = lambda: 1
    set_clock(timedelta(0))
    try:
        yield b
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def fake() -> Iterator[Backend]:
    yield from _serve(make_like_fake())


@pytest.fixture(params=["fake", "real"])
def backend(request: pytest.FixtureRequest) -> Iterator[Backend]:
    b = make_like_fake() if request.param == "fake" else make_real()
    if b.name == "real":
        try:
            b.db.fetch_all("SELECT COUNT(*) AS n FROM share_likes")
        except Exception as ex:  # noqa: BLE001  share_likes がまだ無い（手順書 1b 前）なら skip
            pytest.skip(f"share_likes が無いため skip: {type(ex).__name__}")
    yield from _serve(b)


def like(share_id: str, body: Any, raw: bytes | None = None) -> Any:
    client = TestClient(main.app, raise_server_exceptions=False)
    if raw is not None:
        return client.post(f"/api/share-links/{share_id}/likes", content=raw, headers={"Content-Type": "application/json"})
    return client.post(f"/api/share-links/{share_id}/likes", json=body)


def push(share_id: str, pid: str, on: bool = True) -> Any:
    return like(share_id, {"product_id": pid, "on": on})


def counts(share_id: str) -> dict[str, int]:
    r = get(share_id)
    assert r.status_code == 200, r.text
    return {i["product_id"]: i["like_count"] for i in r.json()["items"]}


# U-83 I-52 SP-28 D-39: 押す 0→1→2、取り消し、直接何度も取り消しても 0 を下回らない。リンクごと・商品ごとに別
def test_like_and_undo(backend: Backend) -> None:
    a, b = backend.ids[:2]
    link = create(backend.ids)["share_id"]
    other = create(backend.ids)["share_id"]
    r = push(link, a)
    assert r.status_code == 200 and r.json() == {"product_id": a, "like_count": 1, "capped": False}
    assert push(link, a).json()["like_count"] == 2
    assert counts(link) == {a: 2, b: 0, backend.ids[2]: 0}  # 押していない商品は 0
    assert counts(other) == {a: 0, b: 0, backend.ids[2]: 0}  # 別のリンクは互いに増えない
    assert push(other, a).json()["like_count"] == 1 and counts(link)[a] == 2
    r = push(link, a, on=False)
    assert r.json() == {"product_id": a, "like_count": 1, "capped": False} and counts(link)[a] == 1
    for _ in range(5):  # 直接何度も送っても 0 まで。0 を下回らない（弱点として受け入れる。ADR-009）
        assert push(link, a, on=False).json()["like_count"] in (0, 1)
    assert push(link, a, on=False).json()["like_count"] == 0 and counts(link)[a] == 0
    assert set(r.json()) == {"product_id", "like_count", "capped"}  # 名前・ID・押した人を示す値が無い（L-2）


# U-83 I-60: 数の遷移 0・1・29・30（上限 30）
def test_limit_transitions(fake: Backend) -> None:
    link = create(fake.ids)["share_id"]
    pid = fake.ids[0]
    db = fake.db
    assert isinstance(db, LikeDb)
    for start, end, capped in ((0, 1, False), (1, 2, False), (29, 30, False), (30, 30, True)):
        db.raw.execute("DELETE FROM share_likes")
        if start:
            db.raw.execute("INSERT INTO share_likes VALUES (?, ?, ?, '2026-11-01 12:00:00')", (link, pid, start))
        r = push(link, pid)
        assert r.status_code == 200 and r.json() == {"product_id": pid, "like_count": end, "capped": capped}, (start, r.text)
        assert db.likes() == [(link, pid, end)]  # DB の数も上限を超えない
    db.raw.execute("UPDATE share_likes SET like_count = 1")
    assert push(link, pid, on=False).json()["like_count"] == 0  # 1→0


# I-53 NF-51: 31 回送る。30 回目までは 1〜30、31 回目は 200 のまま増えず capped。別の商品・別のリンクは別に数える。ヘッダーを変えても同じ
def test_cap_31(fake: Backend) -> None:
    link, other = create(fake.ids)["share_id"], create(fake.ids)["share_id"]
    a, b = fake.ids[:2]
    client = TestClient(main.app, raise_server_exceptions=False)
    seen = []
    for n in range(1, 32):
        r = client.post(
            f"/api/share-links/{link}/likes",
            json={"product_id": a, "on": True},
            headers={"X-Forwarded-For": f"10.0.0.{n}", "User-Agent": f"agent-{n}"},  # 毎回変える（IP で見分けない。N-13）
        )
        assert r.status_code == 200
        seen.append((r.json()["like_count"], r.json()["capped"]))
    assert seen[:30] == [(n, False) for n in range(1, 31)]
    assert seen[30] == (30, True)  # 31 回目: 増えない
    assert counts(link) == {a: 30, b: 0, fake.ids[2]: 0}
    assert push(link, b).json() == {"product_id": b, "like_count": 1, "capped": False}  # 別の候補は別に数える
    assert push(other, a).json()["like_count"] == 1  # 別のリンクも別
    db = fake.db
    assert isinstance(db, LikeDb)
    assert [r[2] for r in db.likes() if r[0] == link and r[1] == a] == [30]


# I-60 U-83: on が真偽値でない・無い → 422 invalid_on。数も行も変わらない。product_id の形式違い → 422 invalid_product_id
def test_invalid_input(fake: Backend) -> None:
    link = create(fake.ids)["share_id"]
    a = fake.ids[0]
    db = fake.db
    assert isinstance(db, LikeDb)
    push(link, a)
    before = db.likes()
    reads = len(db.reads)
    bad_ons: list[Any] = ["yes", 1, 0, None, "true", [], {}]
    for bad_on in bad_ons:
        r = like(link, {"product_id": a, "on": bad_on})
        assert (r.status_code, r.json()["error"]["code"]) == (422, "invalid_on"), bad_on
    r = like(link, {"product_id": a})  # on が無い
    assert (r.status_code, r.json()["error"]["code"]) == (422, "invalid_on")
    for bad_pid in (1, None, "p01", "abc", "1.5", "P", "P12345678901", "1 OR 1=1", "P01'; DROP TABLE share_links;--"):
        r = like(link, {"product_id": bad_pid, "on": True})
        assert (r.status_code, r.json()["error"]["code"]) == (422, "invalid_product_id"), bad_pid
    assert like(link, None, raw=b"not json").status_code == 422
    assert like(link, [1, 2]).status_code == 422
    assert db.likes() == before and len(db.reads) == reads  # 数が変わらず、行も増えず、DB も引かない
    assert db.like_writes.count(db.like_writes[0]) == len(db.like_writes) == 1  # 書いたのは最初の 1 回だけ


# I-54 SP-28: 期限（720 時間ちょうどまで 200、0分1秒で 410）・リンクに無い商品 404・形式違い 422・存在しない share_id 404。どれも行は増えない
def test_expiry_and_not_found(fake: Backend) -> None:
    link = create(fake.ids[:2])["share_id"]
    a = fake.ids[0]
    db = fake.db
    assert isinstance(db, LikeDb)
    for delta in (timedelta(0), H720 - SECOND, H720):
        set_clock(delta)
        assert push(link, a).status_code == 200, delta
    n = db.likes()
    for delta in (H720 + SECOND, timedelta(days=31)):
        set_clock(delta)
        r = push(link, a)
        assert (r.status_code, r.json()["error"]["code"]) == (410, "expired") and "like_count" not in r.text
        assert get(link).status_code == 410  # 取得も 410。数も返らない
    set_clock(timedelta(0))
    r = push(link, "P09")  # 形式は合うが、このリンクの商品に無い
    assert (r.status_code, r.json()["error"]["code"]) == (404, "not_found")
    for missing in ("A" * 22, link.swapcase()):  # 形式は合うが該当なし
        assert (push(missing, a).status_code, push(missing, a).json()["error"]["code"]) == (404, "not_found")
    reads = len(db.reads)
    for bad in (link[:-1], link + "x", "!" * 22, "a b" + "c" * 19, "a" * 21 + "é"):  # 形式が不正なら DB を引かない
        assert push(bad, a).status_code == 404, bad
    assert len(db.reads) == reads
    assert db.likes() == n and db.like_writes.__len__() == 3  # 増えたのは最初の 3 回（期限内）だけ


# I-55 SP-06: 第1弾で作ったリンク（share_likes に行が無い）。取得は 200 で like_count=0 が加わるだけ。いいねは 1 から数え始められる
def test_old_link_regression(fake: Backend) -> None:
    link = create(fake.ids[:2])["share_id"]
    r = get(link)
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {"created_at", "expires_at", "items"}
    for item in body["items"]:
        assert set(item) == {"product_id", "status", "name", "price", "reason", "like_count"} and item["like_count"] == 0
    assert [i["product_id"] for i in body["items"]] == fake.ids[:2]  # 並びは選んだ順のまま（数で並べ替えない）
    assert push(link, fake.ids[1]).json()["like_count"] == 1
    assert [i["like_count"] for i in get(link).json()["items"]] == [0, 1]
    set_clock(H720 + SECOND)
    assert get(link).status_code == 410  # 410 は第1弾と同じ
    assert get("A" * 22).status_code == 404


# SP-28: DB 障害は 500 internal_error。許可していない文（上限なしの INSERT など）は Db が止める
def test_db_failure(fake: Backend) -> None:
    link = create(fake.ids)["share_id"]

    class Broken(Db):
        def fetch_all(self, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
            raise DbError("OperationalError")

    main.app.dependency_overrides[get_db] = lambda: Broken()
    r = push(link, fake.ids[0])
    assert (r.status_code, r.json()["error"]["code"]) == (500, "internal_error")


def test_sql_is_the_designed_one(fake: Backend) -> None:
    """書く文は設計 D-39 の 2 本だけ（I-52。DB には値を params で渡す）"""
    import api.share_links as m

    link = create(fake.ids)["share_id"]
    push(link, fake.ids[0])
    push(link, fake.ids[0], on=False)
    db = fake.db
    assert isinstance(db, LikeDb)
    assert db.like_writes == [m.INSERT_LIKE, m.UPDATE_UNLIKE]
    assert all("%s" in s and link not in s for s in db.like_writes)
    assert json.dumps(db.likes())  # 個人を示す列が無い: share_id・product_id・like_count だけ
