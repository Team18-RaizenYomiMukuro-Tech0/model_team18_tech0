# logging_setup.py — アプリのログ（設計.md「アプリのログ」・N-13・NF-35）
# 残すのは 時刻（UTC）・API の種類・結果（成功・入力エラー・見つからない・期限切れ・失敗の別と状態コード）だけ。
# IP アドレス・ブラウザの情報（User-Agent）・入力値・共有リンクの識別子は残さない。
# API の種類は、パスの型（/api/share-links/{id}）。どの API にも当たらないパスは (該当なし) とだけ書く。
# 例外のときは、種類と場所だけ（リクエストの中身・接続情報・秘密情報は出さない）。
# uvicorn の標準のアクセスログ（IP を出す）は止める。起動は `uvicorn main:app --no-access-log` でも止める（#65）。
import logging
import sys
import traceback
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse

from db import DbError

LOGGER_NAME = "giftia.api"
UNMATCHED = "(該当なし)"
RESULTS = {404: "見つからない", 410: "期限切れ"}


def result_of(status: int) -> str:
    if status in RESULTS:
        return RESULTS[status]
    if status == 422:
        return "入力エラー"
    if status >= 500:
        return "失敗"
    return "成功" if status < 400 else "入力エラー"


class _UtcFormatter(logging.Formatter):
    def formatTime(self, record: logging.LogRecord, datefmt: str | None = None) -> str:
        return datetime.fromtimestamp(record.created, UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


class _StdoutHandler(logging.Handler):
    """標準出力に 1 行ずつ出す。出す時の標準出力を見る（差し替えに追従）"""

    def emit(self, record: logging.LogRecord) -> None:
        sys.stdout.write(self.format(record) + "\n")
        sys.stdout.flush()


def setup_logging() -> logging.Logger:
    """自前のログを 1 か所に置き、uvicorn の標準のアクセスログを止める。何度呼んでも同じ"""
    logging.getLogger("uvicorn.access").disabled = True
    logger = logging.getLogger(LOGGER_NAME)
    logger.setLevel(logging.INFO)
    logger.propagate = False
    if not logger.handlers:
        h = _StdoutHandler()
        h.setFormatter(_UtcFormatter("%(asctime)s %(message)s"))
        logger.addHandler(h)
    return logger


def _where(ex: BaseException) -> str:
    """例外の場所（ファイル名:行 関数名）だけ。メッセージ・引数は出さない"""
    tb = traceback.extract_tb(ex.__traceback__)
    if not tb:
        return "-"
    f = tb[-1]
    return f"{f.filename.rsplit('/', 1)[-1]}:{f.lineno} {f.name}"


def install(app: FastAPI) -> None:
    """全リクエストの結果を 1 行ずつ残す。500 は種類と場所だけを足し、internal_error を返す"""
    logger = setup_logging()

    @app.middleware("http")
    async def log_request(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        extra = ""
        try:
            response = await call_next(request)
        except Exception as ex:  # noqa: BLE001  DbError も含め、詳細は返さず internal_error にする（D-01・D-05・D-06）
            kind = "DbTimeout" if isinstance(ex, DbError) and type(ex).__name__ == "DbTimeout" else type(ex).__name__
            extra = f" {kind} {_where(ex)}"
            response = JSONResponse(
                {"error": {"code": "internal_error", "message": "失敗しました。もう一度お試しください"}}, status_code=500
            )
        route = request.scope.get("route")
        api = f"{request.method} {route.path}" if route is not None else f"{request.method} {UNMATCHED}"
        logger.info("%s %s %d%s", api, result_of(response.status_code), response.status_code, extra)
        return response
