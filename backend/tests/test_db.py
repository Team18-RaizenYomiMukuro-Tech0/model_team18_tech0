# 完了条件 #2〜#4（NF-05・NF-08・NF-09・NF-10・NF-41・NF-45、E-13、設計.md N-04）
import os
import re
import threading
import time
from functools import partial
from pathlib import Path
from typing import Any, Self

import certifi
import pytest

import database
from db import Db, DbError, DbNotAllowed, DbTimeout, check_sql

BACKEND = Path(__file__).resolve().parent.parent
# 消した環境変数の名前。完了条件 #4 の grep に引っかからないよう、つなげて作る
NAME_VAR = "GIFTIA_DB_" + "NAME"
CA_VAR = "GIFTIA_DB_" + "SSL_CA"


class FakeCursor:
    def __init__(self, log: list[tuple[str, tuple[Any, ...]]], delay: float = 0.0) -> None:
        self.log, self.delay = log, delay

    def __enter__(self) -> Self:
        return self

    def __exit__(self, *a: object) -> None:
        return None

    def execute(self, sql: str, params: tuple[Any, ...] = ()) -> None:
        if self.delay:
            threading.Event().wait(self.delay)  # 偽の遅い問い合わせ（時計には頼らない）
        self.log.append((sql, params))

    def fetchall(self) -> list[dict[str, Any]]:
        return [{"ok": 1}]


class FakeConn:
    def __init__(self, log: list[tuple[str, tuple[Any, ...]]], delay: float = 0.0) -> None:
        self.log, self.delay, self.closed, self.committed = log, delay, False, False

    def cursor(self) -> FakeCursor:
        return FakeCursor(self.log, self.delay)

    def commit(self) -> None:
        self.committed = True

    def close(self) -> None:
        self.closed = True


def test_timeout() -> None:
    """E-13: 11 秒かかる問い合わせは約 10 秒で打ち切られ、DbTimeout（呼び出し側で 500 internal_error）になる"""
    log: list[tuple[str, tuple[Any, ...]]] = []
    db = Db(lambda: FakeConn(log, delay=11))
    t0 = time.monotonic()
    with pytest.raises(DbTimeout):
        db.fetch_all("SELECT 1")
    took = time.monotonic() - t0
    assert 9.5 <= took <= 10.5, took
    assert issubclass(DbTimeout, DbError)


def test_timeout_is_not_overridable(monkeypatch: pytest.MonkeyPatch) -> None:
    import db as dbmod

    monkeypatch.setenv("REQUEST_TIMEOUT_SECONDS", "1")
    monkeypatch.setenv("DB_TIMEOUT_SECONDS", "1")
    assert dbmod.DB_TIMEOUT_SECONDS == 10
    assert not hasattr(Db(), "timeout")


EVIL = ["' OR 1=1 --", "送別' OR '1'='1", "3000to4999; DROP TABLE share_links;--", "1 OR 1=1", "x'"]


def test_parameterized() -> None:
    """NF-05・NF-45: 引用符や OR 1=1 を含む値は、SQL 文には入らず params として渡るだけ"""
    sql = "SELECT name FROM products WHERE category = %s AND price <= %s"
    for v in EVIL:
        log: list[tuple[str, tuple[Any, ...]]] = []
        rows = Db(partial(FakeConn, log)).fetch_all(sql, (v, 3000))
        assert rows == [{"ok": 1}]
        assert log == [(sql, (v, 3000))]  # 文は変わらず、値は別に渡る
        assert v not in log[0][0]


def test_write_only_share_links_insert() -> None:
    """NF-41: 書き込みは share_links への INSERT だけ。それ以外は DB に送らず止める"""
    ok = "INSERT INTO share_links (share_id, items, created_at) VALUES (%s, %s, %s)"
    log: list[tuple[str, tuple[Any, ...]]] = []
    conn = FakeConn(log)
    Db(lambda: conn).insert_share_link(ok, ("a", "[]", "t"))
    assert log == [(ok, ("a", "[]", "t"))] and conn.committed and conn.closed
    bad_writes = [
        "UPDATE share_links SET items = %s", "DELETE FROM share_links", "INSERT INTO products (a) VALUES (%s)",
        "REPLACE INTO share_links (a) VALUES (%s)", "TRUNCATE TABLE share_links", "DROP TABLE share_links",
        "ALTER TABLE share_links ADD c INT", "CREATE TABLE t (a INT)", "GRANT ALL ON *.* TO x",
        "INSERT INTO share_links (a) VALUES ('直接の値')", "INSERT INTO share_links (a) VALUES (%s); DROP TABLE x",
        "INSERT INTO users (a) VALUES (%s)", "INSERT INTO giftia_t502.share_links (a) VALUES (%s)",
    ]
    for s in bad_writes:
        with pytest.raises(DbNotAllowed):
            check_sql(s, write=True)
        with pytest.raises(DbNotAllowed):
            Db(lambda: FakeConn(log)).fetch_all(s)  # 読み取りの口からも書けない
    assert len(log) == 1  # 許さない文は 1 つも DB に届かない


def test_write_allow_list_wave2() -> None:
    """NF-52（D-45）: 書き込みは share_links の INSERT・share_likes の INSERT…ON DUPLICATE KEY UPDATE と UPDATE・usage_events の INSERT IGNORE だけ"""
    ok = [
        "INSERT INTO share_likes (share_id, product_id, like_count, updated_at) VALUES (%s, %s, 1, %s) "
        "ON DUPLICATE KEY UPDATE like_count = IF(like_count < %s, like_count + 1, like_count), updated_at = %s",
        "UPDATE share_likes SET like_count = GREATEST(like_count - 1, 0), updated_at = %s WHERE share_id = %s AND product_id = %s",
        "INSERT IGNORE INTO usage_events (visit_id, visitor_id, step, occurred_at, is_test) VALUES (%s, %s, %s, %s, %s)",
    ]
    log: list[tuple[str, tuple[Any, ...]]] = []
    for s in ok:
        check_sql(s, write=True)
        conn = FakeConn(log)
        Db(lambda c=conn: c).write(s, ("a",))  # type: ignore[misc]
        assert conn.committed and conn.closed
    assert [x[0] for x in log] == ok
    bad = [
        "DELETE FROM share_likes WHERE share_id = %s", "DELETE FROM usage_events WHERE is_test = 1",
        "UPDATE share_likes SET like_count = 0",  # WHERE なし
        "UPDATE usage_events SET step = 1 WHERE event_id = %s", "INSERT INTO usage_events (visit_id) VALUES (%s)",  # IGNORE なし
        "INSERT IGNORE INTO share_likes (share_id) VALUES (%s)", "INSERT INTO share_likes (share_id) VALUES (%s)",  # ON DUPLICATE なし
        "REPLACE INTO share_likes (share_id) VALUES (%s)", "TRUNCATE TABLE usage_events", "DROP TABLE share_likes",
        "ALTER TABLE usage_events ADD c INT", "CREATE TABLE share_likes (a INT)", "GRANT ALL ON *.* TO x",
        "INSERT IGNORE INTO products (a) VALUES (%s)", "INSERT IGNORE INTO usage_events (a) SELECT a FROM products",
        "INSERT INTO share_likes (a) VALUES (%s) ON DUPLICATE KEY UPDATE a = (SELECT 1 FROM products)",
        "UPDATE share_likes s JOIN products p ON p.product_id = s.product_id SET s.like_count = 1 WHERE 1 = %s",
        "INSERT IGNORE INTO usage_events (a) VALUES ('直接の値')", "INSERT IGNORE INTO usage_events (a) VALUES (%s); DROP TABLE x",
        "INSERT IGNORE INTO giftia_t502.usage_events (a) VALUES (%s)", "INSERT INTO users (a) VALUES (%s)",
    ]
    for s in bad:
        with pytest.raises(DbNotAllowed):
            check_sql(s, write=True)
        with pytest.raises(DbNotAllowed):
            Db(lambda: FakeConn(log)).write(s, ())
        with pytest.raises(DbNotAllowed):
            Db(lambda: FakeConn(log)).fetch_all(s)  # 読み取りの口からも書けない
    assert len(log) == 3  # 許さない文は 1 つも DB に届かない


def test_read_scope() -> None:
    for s in ["SELECT 1; SELECT 2", "SELECT * FROM users", "SELECT * FROM giftia_t502.products", "USE giftia_t502",
              "SELECT 1 -- x", "SELECT 1 /* x */", "DELETE FROM products", "UPDATE products SET a = 1"]:
        with pytest.raises(DbNotAllowed):
            check_sql(s, write=False)
    check_sql("SELECT a FROM products WHERE b IN (%s, %s)", write=False)


def test_fixed_target(monkeypatch: pytest.MonkeyPatch) -> None:
    """NF-09: DB 名は giftia_t501 の定数。環境変数で別の名前を渡しても、渡る DB 名は変わらない"""
    seen: list[dict[str, Any]] = []
    monkeypatch.setattr("pymysql.connect", lambda **kw: seen.append(kw))
    for k, v in (("GIFTIA_DB_HOST", "h"), ("GIFTIA_DB_USER", "u"), ("GIFTIA_DB_PASSWORD", "p")):
        monkeypatch.setenv(k, v)
    for name in ("giftia_t502", ""):
        monkeypatch.setenv(NAME_VAR, name)
        database.get_connection()
    assert [kw["database"] for kw in seen] == ["giftia_t501", "giftia_t501"]
    assert database.DB_NAME == "giftia_t501"
    # 設定の例・コードに消した環境変数の名前が出てこない。DB 名の文字列は定数の 1 か所だけ
    texts = {p.name: p.read_text(encoding="utf-8") for p in [*BACKEND.glob("*.py"), BACKEND / ".env.example"]}
    for name, t in texts.items():
        assert NAME_VAR not in t and CA_VAR not in t, name
    code = {n: t for n, t in texts.items() if n.endswith(".py")}
    assert [n for n, t in code.items() if re.search(r"giftia_t\d{3}\b", t) and n != "db.py"] == ["database.py"]


def test_ssl_arguments(monkeypatch: pytest.MonkeyPatch) -> None:
    """NF-10 ②③: CA は certifi の束、ホスト名の検証は有効。消した証明書の環境変数を置いても影響しない"""
    seen: list[dict[str, Any]] = []
    monkeypatch.setattr("pymysql.connect", lambda **kw: seen.append(kw))
    for k, v in (("GIFTIA_DB_HOST", "h"), ("GIFTIA_DB_USER", "u"), ("GIFTIA_DB_PASSWORD", "p")):
        monkeypatch.setenv(k, v)
    monkeypatch.setenv(CA_VAR, "/no/such/file.pem")
    database.get_connection()
    assert seen[0]["ssl"] == {"ca": certifi.where(), "check_hostname": True}
    src = "".join(p.read_text(encoding="utf-8") for p in BACKEND.glob("*.py"))
    assert CA_VAR not in src and CA_VAR + "_PEM" not in src
    assert not re.search(r"check_hostname['\"]?\s*[:=]\s*False|verify_mode|verify_cert|CERT_NONE", src)


def test_execute_only_in_db_py() -> None:
    """完了条件 #3 の grep: execute( を呼ぶのは db.py だけで、SQL に値を連結する書き方が無い"""
    callers = [p.name for p in BACKEND.glob("*.py") if re.search(r"\bexecute\(", p.read_text(encoding="utf-8"))]
    assert callers == ["db.py"]


@pytest.mark.skipif(not os.environ.get("GIFTIA_DB_HOST"), reason="手元の .env が要る（PM が手元で実行する）")
def test_ssl() -> None:
    """完了条件 #4: 暗号方式が空でない（SSL で接続）。接続情報は出さない"""
    rows = Db().fetch_all("SHOW SESSION STATUS LIKE 'Ssl_cipher'")
    assert rows and rows[0]["Value"]
