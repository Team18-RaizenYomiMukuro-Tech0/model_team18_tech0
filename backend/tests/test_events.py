# Issue #283（D6）: POST /api/events（計測を受ける）。テスト設計 I-56〜I-58・NF-50・NF-52・NF-53（サーバー側）、U-81 のサーバーが守る部分。
# DB は使わない（偽の DB。メモリ上の SQLite）。合言葉の値はテストの中だけの仮の文字列（本物の GIFTIA_TEST_KEY ではない）。
import json
from collections.abc import Iterator
from datetime import UTC, datetime
from typing import Any

import pytest
from candidates_support import CandidateDb, product
from fastapi.testclient import TestClient
from test_products_filter import FakeConn, FakeCursor

import main
from clock import get_clock
from db import Db, DbError, get_db

URL = "/api/events"
VISIT = "AAAAAAAAAAAAAAAAAAAAAA"  # 22 文字
VISITOR = "bbbbbbbbbbbbbbbbbbbbbb"
KEY = "kari-gouji-ni-tame-sunomi"  # テストの中だけの仮の文字列
NOW = datetime(2026, 11, 15, 3, 4, 5, 678901, tzinfo=UTC)

SCHEMA = (
    "CREATE TABLE usage_events (event_id INTEGER PRIMARY KEY AUTOINCREMENT, visit_id TEXT NOT NULL, visitor_id TEXT NOT NULL, "
    "step INTEGER NOT NULL, occurred_at TEXT NOT NULL, scene TEXT, has_voice INTEGER, entry TEXT, zero_cond TEXT, "
    "is_test INTEGER NOT NULL DEFAULT 0, UNIQUE (visit_id, step))"
)


class _Cur(FakeCursor):
    def execute(self, sql: str, params: tuple[Any, ...] = ()) -> None:
        super().execute(sql.replace("INSERT IGNORE", "INSERT OR IGNORE"), params)  # MySQL の INSERT IGNORE を SQLite の言い方に


class _Conn(FakeConn):
    def cursor(self) -> _Cur:
        return _Cur(self.conn)


class EventDb(CandidateDb):
    """使用記録の表を足した偽の DB。書いた SQL（先頭の語まで）を覚える"""

    def __init__(self) -> None:
        super().__init__([product("P01", "送別", 1, 3500, 4.0, 10)])
        self.raw.execute(SCHEMA)
        self.writes: list[str] = []
        self._connect = lambda: _Conn(self.raw)

    def write(self, sql: str, params: tuple[Any, ...]) -> None:
        self.writes.append(sql)
        super().write(sql, params)

    def rows(self) -> list[dict[str, Any]]:
        cur = self.raw.execute("SELECT visit_id, visitor_id, step, occurred_at, scene, has_voice, entry, zero_cond, is_test FROM usage_events ORDER BY event_id")
        names = [d[0] for d in cur.description]
        return [dict(zip(names, r, strict=True)) for r in cur.fetchall()]


class Fixed:
    def now(self) -> datetime:
        return NOW


@pytest.fixture
def db() -> EventDb:
    return EventDb()


@pytest.fixture
def client(db: EventDb) -> Iterator[TestClient]:
    main.app.dependency_overrides[get_db] = lambda: db
    main.app.dependency_overrides[get_clock] = lambda: Fixed()
    try:
        yield TestClient(main.app)
    finally:
        main.app.dependency_overrides.clear()


def body(step: Any, **extra: Any) -> dict[str, Any]:
    return {"visit_id": VISIT, "visitor_id": VISITOR, "step": step, **extra}


def post(client: TestClient, payload: Any) -> Any:
    data = payload if isinstance(payload, bytes) else json.dumps(payload, ensure_ascii=False).encode()
    return client.post(URL, content=data, headers={"Content-Type": "application/json"})


# I-56: 段 1〜6 を 1 回ずつ＋段 7＝7 行。同じ段の 2 回目は行が増えない（204 のまま）。値は決まった段にだけ入る。時刻はサーバーの時計（UTC）
def test_one_row_per_step_and_duplicates_ignored(client: TestClient, db: EventDb, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GIFTIA_TEST_KEY", raising=False)
    sent = [
        body(1, entry="search"), body(2, scene="お礼"), body(3, scene="お礼", has_voice=True), body(4), body(5), body(6),
        body(7, zero_cond="both", scene="送別"),
    ]  # fmt: skip
    for b in sent:
        r = post(client, b)
        assert r.status_code == 204 and r.content == b""
    assert post(client, body(3, scene="誕生日", has_voice=False)).status_code == 204  # 同じ訪問・同じ段の 2 回目は 204 のまま
    rows = db.rows()
    assert [r["step"] for r in rows] == [1, 2, 3, 4, 5, 6, 7]
    assert rows[2]["scene"] == "お礼" and rows[2]["has_voice"] == 1  # 2 回目（誕生日・声なし）は入らない
    assert (rows[0]["entry"], rows[0]["scene"], rows[0]["has_voice"], rows[0]["zero_cond"]) == ("search", None, None, None)
    assert (rows[6]["zero_cond"], rows[6]["scene"], rows[6]["entry"]) == ("both", None, None)  # scene は段 2・3 だけ
    assert all(r["occurred_at"] == "2026-11-15 03:04:05" and r["is_test"] == 0 for r in rows)
    assert all(r["visit_id"] == VISIT and r["visitor_id"] == VISITOR for r in rows)
    # 段に合わない項目は捨てる（entry は段 1、has_voice は段 3、zero_cond は段 7 だけ）
    post(client, {**body(4, entry="top", has_voice=True, zero_cond="price", scene="送別"), "visit_id": "C" * 22})
    last = db.rows()[-1]
    assert (last["entry"], last["has_voice"], last["zero_cond"], last["scene"]) == (None, None, None, None)


# I-56 K-5: 設定あり・一致のときだけ is_test=1。不一致・無し・未設定は 0。どれも 204。値は保存しない・ログに出さない
def test_test_mark_only_when_key_matches(client: TestClient, db: EventDb, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    monkeypatch.setenv("GIFTIA_TEST_KEY", KEY)
    assert post(client, {**body(1, entry="top"), "test_key": KEY}).status_code == 204  # ① 一致
    assert post(client, {**body(2), "test_key": "ちがう値"}).status_code == 204  # ② 不一致
    assert post(client, body(3)).status_code == 204  # ② test_key 無し
    monkeypatch.delenv("GIFTIA_TEST_KEY")
    assert post(client, {**body(4), "test_key": KEY}).status_code == 204  # ③ 未設定
    monkeypatch.setenv("GIFTIA_TEST_KEY", "")
    assert post(client, {**body(5), "test_key": ""}).status_code == 204  # ③ 空のまま同じ空は「一致」にしない
    assert [r["is_test"] for r in db.rows()] == [1, 0, 0, 0, 0]
    out = capsys.readouterr().out
    assert KEY not in out and "ちがう値" not in out  # ④ ログに出ない（時刻・API・結果だけ）
    assert not any("test_key" in c for c in db.writes)  # 値は列に無く、SQL にも入らない
    stored = json.dumps(db.rows(), ensure_ascii=False)
    assert KEY not in stored and "ちがう値" not in stored


# I-57: 不正は 422 invalid_event（理由は返さない）。行は増えない。is_test を本文に入れても無視。test_key は 64 文字まで
def test_invalid_bodies(client: TestClient, db: EventDb, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GIFTIA_TEST_KEY", KEY)
    bad: list[Any] = [
        body(0), body(8), body(-1), body(1.5), body(True), body("1"), {**body(1), "step": None},
        {k: v for k, v in body(1).items() if k != "visit_id"}, {k: v for k, v in body(1).items() if k != "step"},
        {**body(1), "visit_id": "short"}, {**body(1), "visit_id": "A" * 23}, {**body(1), "visit_id": "A" * 21 + "="},
        {**body(1), "visitor_id": "あ" * 22}, {**body(1), "visit_id": 123},
        body(1, entry="home"), body(1, entry="TOP"), body(7, zero_cond="none"), body(2, scene="取引先"), body(3, has_voice="yes"), body(3, has_voice=2),
        {**body(1), "name": "山田"}, {**body(1), "email": "a@example.com"}, {**body(1), "product_id": "P01"}, {**body(1), "q": "検索語"},
        {**body(1), "test_key": "x" * 65}, {**body(1), "test_key": 123},
        [1, 2], "text", None, 5,
        b"", b"{", b"not json", b"[" * 100000,
        {**body(1), "pad": "x" * 1100},
    ]  # fmt: skip
    for b in bad:
        r = post(client, b)
        assert r.status_code == 422 and r.json() == {"error": {"code": "invalid_event", "message": "計測の形が正しくありません"}}, b
    assert db.rows() == []  # 1 行も増えない
    # 64 文字は受け付け、本文の is_test は無視される（合わない test_key のまま is_test=0）
    assert post(client, {**body(1), "test_key": "x" * 64, "is_test": 1}).status_code == 204
    assert post(client, {**body(2), "is_test": True}).status_code == 204
    assert [r["is_test"] for r in db.rows()] == [0, 0]


# NF-53: 入力の文字列が SQL の文に入らない（位置指定だけ）。決まった語以外は 422 で DB に届かない。書き込みは許可の 1 文だけ（NF-52）
def test_injection_never_reaches_sql(client: TestClient, db: EventDb) -> None:
    for payload in (
        body(1, entry="' OR 1=1"), body(2, scene="送別' OR '1'='1"), body(7, zero_cond="price; DROP TABLE usage_events;--"),
        {**body(1), "visit_id": "A" * 20 + "';"}, {**body(1), "test_key": "' OR 1=1 --"},
    ):  # fmt: skip
        r = post(client, payload)
        assert r.status_code in (204, 422)
    assert len(db.rows()) <= 1 and db.raw.execute("SELECT COUNT(*) FROM usage_events").fetchone()[0] <= 1
    assert all(w.startswith("INSERT IGNORE INTO usage_events") and "'" not in w and "OR 1=1" not in w for w in db.writes)
    assert len(set(db.writes)) <= 1  # 書き込みの文はいつも同じ 1 本


# I-58: 計測だけを失敗させても、ほかの API は変わらない。計測は 500 internal_error（画面は何も出さない）
def test_failure_is_isolated(db: EventDb, monkeypatch: pytest.MonkeyPatch) -> None:
    class BrokenWrite(EventDb):
        def write(self, sql: str, params: tuple[Any, ...]) -> None:
            raise DbError("OperationalError")

    broken = BrokenWrite()
    main.app.dependency_overrides[get_db] = lambda: broken
    main.app.dependency_overrides[get_clock] = lambda: Fixed()
    try:
        c = TestClient(main.app, raise_server_exceptions=False)
        r = post(c, body(1))
        assert r.status_code == 500 and r.json()["error"]["code"] == "internal_error"
        assert c.get("/api/candidates?scene=送別").status_code == 200  # ほかの API は正常
        assert c.get("/api/products").status_code == 200
    finally:
        main.app.dependency_overrides.clear()


def test_get_and_other_methods_not_allowed(client: TestClient) -> None:
    assert client.get(URL).status_code == 405
    assert client.put(URL, content=b"{}").status_code == 405


def test_db_class_has_write(db: EventDb) -> None:
    assert isinstance(db, Db) and callable(db.write)
