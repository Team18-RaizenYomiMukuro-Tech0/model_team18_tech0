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
    dbmod._idle = []
    yield
    dbmod._warm_thread = None
    dbmod._idle = []


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
    dbmod._idle = [stale]  # 前の要求が残した、切れた接続
    assert d.fetch_all("SELECT 1") == [{"ok": 1}]
    assert stale.closed and len(made) == 1 and made[0].executed == 1  # 作り直して 1 回やり直した


def test_other_errors_are_not_retried_and_connection_is_closed() -> None:
    d, made = keep_db([Conn(fail=pymysql.err.ProgrammingError(1064, "syntax"))])
    with pytest.raises(dbmod.DbError, match="ProgrammingError"):
        d.fetch_all("SELECT 1")
    assert len(made) == 1 and made[0].closed and dbmod._idle == []  # 失敗した接続は残さない


def test_error_on_fresh_connection_is_not_retried() -> None:
    d, made = keep_db([Conn(fail=pymysql.err.OperationalError(2013, "Lost connection"))])
    with pytest.raises(dbmod.DbError):
        d.fetch_all("SELECT 1")
    assert len(made) == 1 and made[0].closed  # 作ったばかりの接続の失敗は、やり直さない


def test_idle_connections_are_kept_up_to_the_limit() -> None:
    """D-45: 残す接続は 3〜4 本（DB_IDLE_MAX）。超えて戻ってきた接続は閉じる。NF-54 の接続が足りなくならない前提"""
    from config import SETTINGS

    assert 3 <= SETTINGS.DB_IDLE_MAX <= 4
    d, made = keep_db([])
    kept = [Conn() for _ in range(SETTINGS.DB_IDLE_MAX)]
    for c in kept:
        dbmod._give_back(c)
    dbmod._give_back(extra := Conn())
    assert extra.closed and all(not c.closed for c in kept) and len(dbmod._idle) == SETTINGS.DB_IDLE_MAX
    assert d.fetch_all("SELECT 1") and made == [] and sum(c.executed for c in kept) == 1  # 残してある接続を使う


def test_three_parallel_requests_reuse_three_connections() -> None:
    """詳細の画面は 3 つの API を同時に呼ぶ。3 本残っていれば、新しく接続しない"""
    import threading

    d, made = keep_db([])
    for _ in range(3):
        dbmod._give_back(Conn())
    out: list[Any] = []
    ts = [threading.Thread(target=lambda: out.append(d.fetch_all("SELECT 1"))) for _ in range(3)]
    for t in ts:
        t.start()
    for t in ts:
        t.join(5)
    assert len(out) == 3 and made == [] and len(dbmod._idle) == 3


def test_database_connection_is_autocommit(monkeypatch: pytest.MonkeyPatch) -> None:
    """接続を使い回しても、読み取りが古い見え方のまま残らない"""
    import database

    seen: list[dict[str, Any]] = []
    monkeypatch.setattr("pymysql.connect", lambda **kw: seen.append(kw))
    for k in ("GIFTIA_DB_HOST", "GIFTIA_DB_USER", "GIFTIA_DB_PASSWORD"):
        monkeypatch.setenv(k, "x")
    database.get_connection()
    assert seen[0]["autocommit"] is True


def test_warm_up_puts_one_connection_ready() -> None:
    """起動時に 1 本先に作って残す。最初の要求は新しく作らずにその接続を使う"""
    made: list[Conn] = []

    def connect() -> Conn:
        made.append(Conn())
        return made[-1]

    dbmod.warm_up(connect).join(5)
    assert len(made) == 1 and dbmod._idle == [made[0]] and not made[0].closed
    d, more = keep_db([])
    assert d.fetch_all("SELECT 1") == [{"ok": 1}]
    assert more == [] and made[0].executed == 1  # 要求は新しい接続を作っていない


def test_first_request_waits_for_the_connection_being_made() -> None:
    """先に作っている最中に要求が来たら、もう 1 本作らずにその接続を待って使う"""
    import threading
    import time

    gate = threading.Event()
    made: list[Conn] = []

    def slow_connect() -> Conn:
        gate.wait(5)
        made.append(Conn())
        return made[-1]

    dbmod.warm_up(slow_connect)
    threading.Timer(0.3, gate.set).start()
    d, more = keep_db([])
    t0 = time.monotonic()
    assert d.fetch_all("SELECT 1") == [{"ok": 1}]
    assert more == [] and len(made) == 1 and made[0].executed == 1 and time.monotonic() - t0 >= 0.25


def test_warm_up_failure_does_not_stop_startup() -> None:
    def broken() -> Conn:
        raise OSError("接続できない")

    dbmod.warm_up(broken).join(5)  # 例外は外に出ない
    assert dbmod._idle == []
    d, made = keep_db([])
    assert d.fetch_all("SELECT 1") == [{"ok": 1}] and len(made) == 1  # 最初の要求で作る今の動き


def test_main_calls_warm_up_at_import() -> None:
    """main.py は読み込むときに warm_up() を 1 回呼ぶ（uvicorn・Functions のどちらも main を読む）"""
    import ast
    from pathlib import Path

    tree = ast.parse((Path(__file__).resolve().parent.parent / "main.py").read_text(encoding="utf-8"))
    calls = [
        n for n in tree.body
        if isinstance(n, ast.Expr) and isinstance(n.value, ast.Call)
        and isinstance(n.value.func, ast.Name) and n.value.func.id == "warm_up"
    ]
    assert len(calls) == 1
    import main

    assert main.warm_up is dbmod.warm_up
