# #256: 候補取得の応答の Server-Timing（内訳は数値だけ）。DB は使わない（偽の接続・偽の DB）
import re
from typing import Any, Self

from candidates_support import CandidateDb, client_for, fd1, fd1_counts

from db import Db, server_timing

METRICS = ("db_wait", "db_connect", "db_sql", "db_total", "total")


def test_candidates_has_server_timing_with_numbers_only() -> None:
    for client in client_for(CandidateDb(fd1(), fd1_counts())):
        r = client.get("/api/candidates", params=[("scene", "送別")])
        assert r.status_code == 200
        h = r.headers["server-timing"]
        for name in METRICS:
            assert re.search(rf"\b{name};dur=\d+(\.\d+)?\b", h)
        assert re.search(r'conn;desc="new=\d reused=\d retry=\d"', h)
        assert not re.search(r"select|giftia|products|password|error", h, re.IGNORECASE)


def test_invalid_request_has_no_timing_and_no_db_call() -> None:
    for client in client_for(CandidateDb(fd1(), fd1_counts())):
        r = client.get("/api/candidates", params=[("scene", "")])
        assert r.status_code == 422
        assert "server-timing" not in r.headers


class _Cur:
    def __enter__(self) -> Self:
        return self

    def __exit__(self, *a: object) -> None:
        return None

    def execute(self, sql: str, params: Any) -> None:
        return None

    def fetchall(self) -> list[Any]:
        return []


class _Conn:
    def cursor(self) -> _Cur:
        return _Cur()

    def commit(self) -> None:
        return None

    def close(self) -> None:
        return None


def test_db_records_new_connection_and_sums() -> None:
    db = Db(connect=_Conn)
    db.fetch_all("SELECT 1")
    db.fetch_all("SELECT 2")
    assert len(db.timings) == 2 and all(t["new"] == 1.0 for t in db.timings)  # 偽の接続は使い回さない
    text = server_timing(db, 0.5)
    assert 'conn;desc="new=2 reused=0 retry=0"' in text and "total;dur=500.0" in text


def test_process_mark_is_numbers_and_nth_counts_up() -> None:
    db = Db(connect=_Conn)
    first = server_timing(db, 0.1)
    second = server_timing(db, 0.1)
    pat = r'proc;desc="pid=\d+ up=\d+ warm=-?\d+ nth=(\d+)"'
    a, b = re.search(pat, first), re.search(pat, second)
    assert a and b and int(b.group(1)) == int(a.group(1)) + 1
    assert not re.search(r"[A-Za-z_]+/|host|user|password", first.replace("proc;desc", "").replace("db_", ""))


def test_warm_up_records_how_long_it_took() -> None:
    import db as dbmod

    dbmod.warm_up(_Conn).join(5)
    assert dbmod._warm_seconds is not None and dbmod._warm_seconds >= 0
    dbmod._take_idle()
