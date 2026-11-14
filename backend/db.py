# db.py — DB 実行口 Db（設計.md D-12・D-13、N-04）
# 候補取得・共有リンクの作成と取得の DB 問い合わせは、すべてここを通る。DB を呼ぶ（execute）のはこのファイルだけ。
#  - 10 秒の上限（E-13）: 超えたら打ち切って DbTimeout にする。上限は REQUEST_TIMEOUT_SECONDS（変更不可）
#  - パラメータ化クエリだけ: 値は %s と params で渡す。SQL 文に値を直接つなげない
#  - コードで縛る 3 つ（#70-2）: ①接続先は giftia_t501 に固定（database.DB_NAME）
#    ②書き込みは許可した 4 つの文だけ（D-45）: share_links への INSERT、share_likes への INSERT … ON DUPLICATE KEY UPDATE と UPDATE、
#      usage_events への INSERT IGNORE。DELETE・別の表・DDL は止める ③SQL はすべてプレースホルダ
# テストでだけ、テストのコードの中で app.dependency_overrides に別の Db を入れる（D-12。入口は他に作らない）。
import contextlib
import itertools
import os
import re
import threading
import time
from collections.abc import Callable
from typing import Any

import pymysql  # type: ignore[import-untyped]  # PyMySQL は型情報を配っていないため

from config import SETTINGS
from database import get_connection

DB_TIMEOUT_SECONDS = SETTINGS.REQUEST_TIMEOUT_SECONDS  # 10 秒。Db の外から変えられない

# 許す文: 読むのは SELECT（と、構造を調べる SHOW）。書くのは次の 4 つだけ（設計.md D-45。N-04）
#  ①INSERT INTO share_links ②INSERT INTO share_likes … ON DUPLICATE KEY UPDATE ③UPDATE share_likes SET … WHERE ④INSERT IGNORE INTO usage_events
_READ_RE = re.compile(r"^\s*(SELECT|SHOW)\b", re.IGNORECASE)
_WRITE_RES = (
    re.compile(r"^\s*INSERT\s+INTO\s+`?share_links`?\s*[\s(]", re.IGNORECASE),
    re.compile(r"^\s*INSERT\s+INTO\s+`?share_likes`?\s*[\s(].*\bON\s+DUPLICATE\s+KEY\s+UPDATE\b", re.IGNORECASE | re.DOTALL),
    re.compile(r"^\s*UPDATE\s+`?share_likes`?\s+SET\b.*\bWHERE\b", re.IGNORECASE | re.DOTALL),
    re.compile(r"^\s*INSERT\s+IGNORE\s+INTO\s+`?usage_events`?\s*[\s(]", re.IGNORECASE),
)
_USERS_RE = re.compile(r"\busers\b", re.IGNORECASE)  # users は読まない・書かない（#58-9）
_OTHER_DB_RE = re.compile(r"\bgiftia_t\d+\b", re.IGNORECASE)  # 別の DB 名の修飾子（t502.… など）を書かない


# 本番の接続（database.get_connection）は 1 本だけ手元に残して使い回す（#256）。暗号化つきの接続を作るのに 1 秒以上かかるため。
#  - 使うとき、残してある接続を「取り出す」（無ければ新しく作る）。同時に 2 つの要求が同じ接続を使うことは無い。
#  - 使い終わったら戻す。すでに IDLE_MAX 本（D-45: 3〜4 本。詳細の画面は 3 つの API を同時に呼ぶ）残っていれば、余った方は閉じる。失敗した接続は戻さずに閉じる。
#  - 接続は autocommit（database.py）。読み取りが古い見え方（スナップショット）のまま残らない。
_idle_lock = threading.Lock()
_idle: list[Any] = []  # 残している接続（小さな入れ物。最大 SETTINGS.DB_IDLE_MAX 本）
_warm_thread: threading.Thread | None = None  # 起動時に先に作っている途中の接続（あれば最初の要求はその完了を待つ）
_PROCESS_START = time.monotonic()  # このプロセスが db.py を読んだ時刻（起動直後かどうかを Server-Timing で見るため。#256）
_requests = itertools.count(1)  # このプロセスが Server-Timing を付けた回数（毎回 1 なら、要求ごとにプロセスが新しい）
_warm_seconds: float | None = None  # 起動時の接続（warm_up）が出来上がるまでにかかった秒（未完了・失敗は None）
_LOST_CODES = (2006, 2013, 2014, 2055)  # MySQL server has gone away / Lost connection など


def _take_idle() -> Any:
    warm = _warm_thread
    if warm is not None and warm.is_alive():  # 先に作っている最中なら、もう 1 本作らずにその完了を待つ（上限は問い合わせと同じ）
        warm.join(DB_TIMEOUT_SECONDS)
    with _idle_lock:
        return _idle.pop() if _idle else None


def _give_back(conn: Any) -> None:
    with _idle_lock:
        if len(_idle) < SETTINGS.DB_IDLE_MAX:
            _idle.append(conn)
            return
    _close_quietly(conn)


def _close_quietly(conn: Any) -> None:
    with contextlib.suppress(Exception):  # 閉じられなくても呼び出し側には関係しない
        conn.close()


def warm_up(connect: Callable[[], Any] = get_connection) -> threading.Thread:
    """起動時に接続を 1 本先に作って残す（#256）。別スレッドで行うので起動は待たない。
    つながらなくても起動は止めず、何も残さない（最初の要求で作る、今までの動きに戻るだけ）"""

    def work() -> None:
        global _warm_seconds
        t0 = time.perf_counter()
        try:
            conn = connect()
        except BaseException:  # noqa: BLE001  失敗しても起動は止めない（原因は最初の要求の失敗として出る）
            return
        _warm_seconds = time.perf_counter() - t0
        _give_back(conn)

    global _warm_thread
    t = threading.Thread(target=work, daemon=True)
    _warm_thread = t
    t.start()
    return t


def _connection_lost(ex: BaseException) -> bool:
    """残していた接続が切れていたことを表す失敗か（作り直して 1 回だけやり直す）"""
    if isinstance(ex, pymysql.err.OperationalError):
        return bool(ex.args) and ex.args[0] in _LOST_CODES
    return isinstance(ex, pymysql.err.InterfaceError | OSError)


class DbError(Exception):
    """DB への問い合わせの失敗（呼び出し側が 500 internal_error に変える）"""


class DbTimeout(DbError):
    """10 秒の上限を超えて打ち切った"""


class DbNotAllowed(DbError):
    """許していない文（書き込みの縛り・プレースホルダの縛りに反する）"""


def check_sql(sql: str, write: bool) -> None:
    """コードで縛る。許さない文なら DbNotAllowed。DB には何も送らない"""
    if ";" in sql or "--" in sql or "/*" in sql or "#" in sql:
        raise DbNotAllowed("複数の文・コメントは使えません")
    if _USERS_RE.search(sql) or _OTHER_DB_RE.search(sql):
        raise DbNotAllowed("users と別の DB は使えません")
    if write:
        if not any(r.match(sql) for r in _WRITE_RES):
            raise DbNotAllowed("書き込みは share_links・share_likes・usage_events への決まった文だけです")
        if re.search(r"\b(SELECT|JOIN)\b", sql, re.IGNORECASE):
            raise DbNotAllowed("書き込みの文に SELECT・JOIN は使えません")
        if "'" in sql or '"' in sql:
            raise DbNotAllowed("値は SQL 文に書かず、%s と params で渡します")
    elif not _READ_RE.match(sql):
        raise DbNotAllowed("読み取りは SELECT だけです")


class Db:
    """問い合わせの実行口。connect は接続を作る関数（既定は班の DB。テストで偽の部品に差し替える）"""

    def __init__(self, connect: Callable[[], Any] = get_connection) -> None:
        self._connect = connect
        self._keep = connect is get_connection  # 本番の接続だけ使い回す。テストの偽の接続は毎回閉じる
        self.timings: list[dict[str, float]] = []  # 問い合わせごとの内訳（数値だけ。#256 の原因調べ用に Server-Timing へ出す）

    def fetch_all(self, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        """SELECT を実行して、行を dict のリストで返す"""
        check_sql(sql, write=False)
        rows = self._run(sql, params, write=False)
        return rows if rows is not None else []

    def insert_share_link(self, sql: str, params: tuple[Any, ...]) -> None:
        """share_links への INSERT を 1 回実行して確定する（共有リンクの作成の口）"""
        check_sql(sql, write=True)
        self._run(sql, params, write=True)

    def write(self, sql: str, params: tuple[Any, ...]) -> None:
        """許可した書き込みの文（D-45）を 1 回実行して確定する。許可の外の文は DB に送らず DbNotAllowed"""
        check_sql(sql, write=True)
        self._run(sql, params, write=True)

    def _run(self, sql: str, params: tuple[Any, ...], write: bool) -> list[dict[str, Any]] | None:
        out: dict[str, Any] = {}
        tm = {"wait": 0.0, "connect": 0.0, "sql": 0.0, "new": 0.0, "reused": 0.0, "retry": 0.0}  # 秒（new・reused・retry は回数）
        start = time.perf_counter()

        def attempt(conn: Any) -> None:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                if write:
                    conn.commit()
                else:
                    out["rows"] = list(cur.fetchall())

        def work() -> None:
            conn = None
            try:
                t0 = time.perf_counter()
                reused = _take_idle() if self._keep else None
                tm["wait"] = time.perf_counter() - t0  # 先に作っている接続の完了待ちを含む
                if reused is not None:
                    conn = reused
                    tm["reused"] = 1.0
                else:
                    t0 = time.perf_counter()
                    conn = self._connect()
                    tm["connect"] += time.perf_counter() - t0
                    tm["new"] = 1.0
                try:
                    t0 = time.perf_counter()
                    attempt(conn)
                    tm["sql"] = time.perf_counter() - t0
                except BaseException as ex:
                    if reused is None or not _connection_lost(ex):
                        raise
                    _close_quietly(conn)  # 残していた接続が切れていた: 作り直して 1 回だけやり直す
                    tm["retry"] = 1.0
                    t0 = time.perf_counter()
                    conn = self._connect()
                    tm["connect"] += time.perf_counter() - t0
                    t0 = time.perf_counter()
                    attempt(conn)
                    tm["sql"] = time.perf_counter() - t0
                if self._keep:
                    _give_back(conn)
                    conn = None
            except BaseException as ex:  # noqa: BLE001  呼び出し側の 500 に変えるため、種類だけ持ち帰る
                out["error"] = ex
            finally:
                if conn is not None:
                    _close_quietly(conn)

        t = threading.Thread(target=work, daemon=True)
        t.start()
        t.join(DB_TIMEOUT_SECONDS)
        tm["total"] = time.perf_counter() - start
        self.timings.append(tm)
        if t.is_alive():  # 打ち切り（後ろで動き続けても結果は使わない）
            raise DbTimeout("DB の問い合わせが上限を超えました")
        if "error" in out:
            raise DbError(type(out["error"]).__name__) from None  # 詳細（接続情報など）は持ち上げない
        rows: list[dict[str, Any]] | None = out.get("rows")
        return rows


def server_timing(db: Db, total_seconds: float) -> str:
    """Db が測った内訳を Server-Timing の値にする（数値だけ。ms）。
    db_wait=残してある接続（または先に作っている接続）を待った、db_connect=新しく接続した、db_sql=問い合わせ、
    db_total=DB 呼び出しの合計、total=要求全体。conn は新しく作った回数・使い回した回数・作り直した回数"""
    def total_of(key: str) -> float:
        return sum(t[key] for t in getattr(db, "timings", []))  # 偽の Db は持たないことがある

    parts = [f"db_{k};dur={total_of(k) * 1000:.1f}" for k in ("wait", "connect", "sql", "total")]
    parts.append(f"total;dur={total_seconds * 1000:.1f}")
    # プロセスの印（数字だけ）: pid、プロセスが起動してからの ms（up）、起動時の接続ができるまでの ms（warm。未完了は -1）、
    # このプロセスで何回目の応答か（nth）。要求ごとにプロセスが新しいなら nth は毎回 1、up は小さい
    warm_ms = -1.0 if _warm_seconds is None else _warm_seconds * 1000
    up_ms = (time.monotonic() - _PROCESS_START) * 1000
    parts.append(f'proc;desc="pid={os.getpid()} up={up_ms:.0f} warm={warm_ms:.0f} nth={next(_requests)}"')
    parts.append(f'conn;desc="new={total_of("new"):.0f} reused={total_of("reused"):.0f} retry={total_of("retry"):.0f}"')
    return ", ".join(parts)


def get_db() -> Db:
    """FastAPI の依存（Depends）。本番版だけを返す"""
    return Db()


def fetch_all(sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    """既存の呼び出し（check_db.py など）のための入口。本番版の Db で読む"""
    return Db().fetch_all(sql, params)
