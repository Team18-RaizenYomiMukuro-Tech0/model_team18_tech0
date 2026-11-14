# Issue #256: 本番の接続を使い回す（db.py の _take_idle / _give_back）。偽の接続だけを使い、班の DB には繋がない。
from typing import Any

import pymysql  # type: ignore[import-untyped]
import pytest

import db as dbmod
from db import Db


class Cur:
    def __init__(self, conn: "Conn") -> None:
        self.conn = conn

    def __enter__(self):
        return self

    def __exit__(self, *a: object) -> None:
        return None

    def execute(self, sql: str, params: tuple[Any, ...] = ()) -> None:
        if self.conn.fail is not None:
            raise self.conn.fail
        self.conn.executed += 1

    def fetchall(self) -> list[dict[str, Any]]:
        return [{"ok": 1}]


class Conn:
    def __init__(self, fail: BaseException | None = None) -> None:
        self.fail, self.executed, self.closed, self.commits = fail, 0, False, 0

    def cursor(self) -> Cur:
        return Cur(self)

    def commit(self) -> None:
        self.commits += 1

    def close(self) -> None:
        self.closed = True


def keep_db(conns: list[Conn]) -> tuple[Db, list[Conn]]:
    """本番と同じく接続を残す Db（接続を作る関数だけ偽）。conns の先頭から順に渡し、作った接続を made に入れる"""
    made: list[Conn] = []

    def connect() -> Conn:
        c = conns.pop(0) if conns else Conn()
        made.append(c)
        return c

    d = Db(connect)
    d._keep = True  # get_connection の代わりに偽の接続を、本番と同じ使い回しの道に通す
    return d, made


@pytest.fixture(autouse=True)
def empty_slot() -> Any:
    dbmod._idle = None
    yield
    dbmod._idle = None


def test_connection_is_reused_across_calls() -> None:
    d, made = keep_db([])
    for _ in range(3):
        assert d.fetch_all("SELECT 1") == [{"ok": 1}]
    assert len(made) == 1 and made[0].executed == 3 and not made[0].closed


def test_default_db_keeps_connection_but_custom_connect_does_not() -> None:
    assert Db()._keep is True
    assert Db(lambda: Conn())._keep is False


def test_write_commits_and_keeps_connection() -> None:
    d, made = keep_db([])
    d.insert_share_link("INSERT INTO share_links (share_id, items, created_at, is_test) VALUES (%s, %s, %s, %s)", ("a", "[]", "t", 1))
    d.fetch_all("SELECT 1")
    assert len(made) == 1 and made[0].commits == 1 and not made[0].closed


def test_lost_connection_is_replaced_once() -> None:
    stale = Conn(fail=pymysql.err.OperationalError(2006, "MySQL server has gone away"))
    d, made = keep_db([])
    dbmod._idle = stale  # 前の要求が残した、切れた接続
    assert d.fetch_all("SELECT 1") == [{"ok": 1}]
    assert stale.closed and len(made) == 1 and made[0].executed == 1  # 作り直して 1 回やり直した


def test_other_errors_are_not_retried_and_connection_is_closed() -> None:
    d, made = keep_db([Conn(fail=pymysql.err.ProgrammingError(1064, "syntax"))])
    with pytest.raises(dbmod.DbError, match="ProgrammingError"):
        d.fetch_all("SELECT 1")
    assert len(made) == 1 and made[0].closed and dbmod._idle is None  # 失敗した接続は残さない


def test_error_on_fresh_connection_is_not_retried() -> None:
    d, made = keep_db([Conn(fail=pymysql.err.OperationalError(2013, "Lost connection"))])
    with pytest.raises(dbmod.DbError):
        d.fetch_all("SELECT 1")
    assert len(made) == 1 and made[0].closed  # 作ったばかりの接続の失敗は、やり直さない


def test_only_one_idle_connection_is_kept() -> None:
    d, made = keep_db([])
    other = Conn()
    dbmod._idle = other
    # 残してある接続を使う → 戻す。同時に別の接続が戻ってきたら余った方は閉じる
    dbmod._give_back(extra := Conn())
    assert extra.closed and dbmod._idle is other
    assert d.fetch_all("SELECT 1") and made == [] and other.executed == 1


def test_database_connection_is_autocommit(monkeypatch: pytest.MonkeyPatch) -> None:
    """接続を使い回しても、読み取りが古い見え方のまま残らない"""
    import database

    seen: list[dict[str, Any]] = []
    monkeypatch.setattr("pymysql.connect", lambda **kw: seen.append(kw))
    for k in ("GIFTIA_DB_HOST", "GIFTIA_DB_USER", "GIFTIA_DB_PASSWORD"):
        monkeypatch.setenv(k, "x")
    database.get_connection()
    assert seen[0]["autocommit"] is True
