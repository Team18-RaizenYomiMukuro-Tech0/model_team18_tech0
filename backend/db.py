# db.py — DB 実行口 Db（設計.md D-12・D-13、N-04）
# 候補取得・共有リンクの作成と取得の DB 問い合わせは、すべてここを通る。DB を呼ぶ（execute）のはこのファイルだけ。
#  - 10 秒の上限（E-13）: 超えたら打ち切って DbTimeout にする。上限は REQUEST_TIMEOUT_SECONDS（変更不可）
#  - パラメータ化クエリだけ: 値は %s と params で渡す。SQL 文に値を直接つなげない
#  - コードで縛る 3 つ（#70-2）: ①接続先は giftia_t501 に固定（database.DB_NAME）
#    ②書き込みは share_links への INSERT だけ ③SQL はすべてプレースホルダ
# テストでだけ、テストのコードの中で app.dependency_overrides に別の Db を入れる（D-12。入口は他に作らない）。
import contextlib
import re
import threading
from collections.abc import Callable
from typing import Any

import pymysql  # type: ignore[import-untyped]  # PyMySQL は型情報を配っていないため

from config import SETTINGS
from database import get_connection

DB_TIMEOUT_SECONDS = SETTINGS.REQUEST_TIMEOUT_SECONDS  # 10 秒。Db の外から変えられない

# 許す文: 読むのは SELECT（と、構造を調べる SHOW）、書くのは INSERT INTO share_links だけ（設計.md N-04 の 4）
_READ_RE = re.compile(r"^\s*(SELECT|SHOW)\b", re.IGNORECASE)
_WRITE_RE = re.compile(r"^\s*INSERT\s+INTO\s+`?share_links`?\s*[\s(]", re.IGNORECASE)
_USERS_RE = re.compile(r"\busers\b", re.IGNORECASE)  # users は読まない・書かない（#58-9）
_OTHER_DB_RE = re.compile(r"\bgiftia_t\d+\b", re.IGNORECASE)  # 別の DB 名の修飾子（t502.… など）を書かない


# 本番の接続（database.get_connection）は 1 本だけ手元に残して使い回す（#256）。暗号化つきの接続を作るのに 1 秒以上かかるため。
#  - 使うとき、残してある接続を「取り出す」（無ければ新しく作る）。同時に 2 つの要求が同じ接続を使うことは無い。
#  - 使い終わったら戻す。すでに 1 本残っていれば、余った方は閉じる。失敗した接続は戻さずに閉じる。
#  - 接続は autocommit（database.py）。読み取りが古い見え方（スナップショット）のまま残らない。
_idle_lock = threading.Lock()
_idle: Any = None
_warm_thread: threading.Thread | None = None  # 起動時に先に作っている途中の接続（あれば最初の要求はその完了を待つ）
_LOST_CODES = (2006, 2013, 2014, 2055)  # MySQL server has gone away / Lost connection など


def _take_idle() -> Any:
    global _idle
    warm = _warm_thread
    if warm is not None and warm.is_alive():  # 先に作っている最中なら、もう 1 本作らずにその完了を待つ（上限は問い合わせと同じ）
        warm.join(DB_TIMEOUT_SECONDS)
    with _idle_lock:
        conn, _idle = _idle, None
    return conn


def _give_back(conn: Any) -> None:
    global _idle
    with _idle_lock:
        if _idle is None:
            _idle = conn
            return
    _close_quietly(conn)


def _close_quietly(conn: Any) -> None:
    with contextlib.suppress(Exception):  # 閉じられなくても呼び出し側には関係しない
        conn.close()


def warm_up(connect: Callable[[], Any] = get_connection) -> threading.Thread:
    """起動時に接続を 1 本先に作って残す（#256）。別スレッドで行うので起動は待たない。
    つながらなくても起動は止めず、何も残さない（最初の要求で作る、今までの動きに戻るだけ）"""

    def work() -> None:
        try:
            conn = connect()
        except BaseException:  # noqa: BLE001  失敗しても起動は止めない（原因は最初の要求の失敗として出る）
            return
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
        if not _WRITE_RE.match(sql):
            raise DbNotAllowed("書き込みは share_links への INSERT だけです")
        if "'" in sql or '"' in sql:
            raise DbNotAllowed("値は SQL 文に書かず、%s と params で渡します")
    elif not _READ_RE.match(sql):
        raise DbNotAllowed("読み取りは SELECT だけです")


class Db:
    """問い合わせの実行口。connect は接続を作る関数（既定は班の DB。テストで偽の部品に差し替える）"""

    def __init__(self, connect: Callable[[], Any] = get_connection) -> None:
        self._connect = connect
        self._keep = connect is get_connection  # 本番の接続だけ使い回す。テストの偽の接続は毎回閉じる

    def fetch_all(self, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        """SELECT を実行して、行を dict のリストで返す"""
        check_sql(sql, write=False)
        rows = self._run(sql, params, write=False)
        return rows if rows is not None else []

    def insert_share_link(self, sql: str, params: tuple[Any, ...]) -> None:
        """share_links への INSERT を 1 回実行して確定する（唯一の書き込みの口）"""
        check_sql(sql, write=True)
        self._run(sql, params, write=True)

    def _run(self, sql: str, params: tuple[Any, ...], write: bool) -> list[dict[str, Any]] | None:
        out: dict[str, Any] = {}

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
                reused = _take_idle() if self._keep else None
                conn = reused if reused is not None else self._connect()
                try:
                    attempt(conn)
                except BaseException as ex:
                    if reused is None or not _connection_lost(ex):
                        raise
                    _close_quietly(conn)  # 残していた接続が切れていた: 作り直して 1 回だけやり直す
                    conn = self._connect()
                    attempt(conn)
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
        if t.is_alive():  # 打ち切り（後ろで動き続けても結果は使わない）
            raise DbTimeout("DB の問い合わせが上限を超えました")
        if "error" in out:
            raise DbError(type(out["error"]).__name__) from None  # 詳細（接続情報など）は持ち上げない
        rows: list[dict[str, Any]] | None = out.get("rows")
        return rows


def get_db() -> Db:
    """FastAPI の依存（Depends）。本番版だけを返す"""
    return Db()


def fetch_all(sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    """既存の呼び出し（check_db.py など）のための入口。本番版の Db で読む"""
    return Db().fetch_all(sql, params)
