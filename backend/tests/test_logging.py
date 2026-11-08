# 完了条件 #5（NF-35、N-13）: ログは 時刻・API・結果だけ。IP・ブラウザ情報・入力値・共有リンクの識別子は出ない
import logging
import re
from typing import Annotated

import pytest
from fastapi import Depends, FastAPI, HTTPException
from fastapi.testclient import TestClient

import logging_setup
from db import Db, DbTimeout

SECRET_ID = "AbCdEfGhIjKlMnOpQrStUv"
UA = "Mozilla/5.0 (X11; Linux) Gecko/20100101 Firefox/200.0"


def make_app() -> FastAPI:
    app = FastAPI()
    logging_setup.install(app)

    @app.get("/api/ok")
    def ok(scene: str = "") -> dict[str, str]:
        return {"scene": scene}

    @app.get("/api/share-links/{share_id}")
    def share(share_id: str) -> dict[str, str]:
        if share_id.startswith("gone"):
            raise HTTPException(410, "expired")
        raise HTTPException(404, "not_found")

    @app.get("/api/bad")
    def bad(n: int) -> dict[str, int]:
        return {"n": n}

    def slow() -> Db:
        raise DbTimeout("x")

    @app.get("/api/boom")
    def boom(db: Annotated[Db, Depends(slow)]) -> None:
        return None

    return app


def test_logging_has_only_time_api_result(caplog: pytest.LogCaptureFixture, capfd: pytest.CaptureFixture[str]) -> None:
    app = make_app()
    client = TestClient(app, raise_server_exceptions=False)
    h = {"User-Agent": UA, "X-Forwarded-For": "203.0.113.9, 2001:db8::1", "Referer": "http://203.0.113.9/"}
    with caplog.at_level(logging.DEBUG):
        statuses = [
            client.get("/api/ok?scene=送別", headers=h).status_code,  # 成功
            client.get("/api/bad?n=abc-secret-input", headers=h).status_code,  # 入力エラー 422
            client.get(f"/api/share-links/{SECRET_ID}", headers=h).status_code,  # 404
            client.get("/api/share-links/gone123456789012345678", headers=h).status_code,  # 410
            client.get("/api/boom", headers=h).status_code,  # 500
            client.get("/no/such/path/203.0.113.9", headers=h).status_code,  # どの API にも当たらない 404
        ]
    assert statuses == [200, 422, 404, 410, 500, 404]
    out = capfd.readouterr().out
    lines = [l for l in out.splitlines() if l.strip()]
    assert len(lines) == 6
    # 形: 時刻 API 結果 状態コード（500 は種類と場所を足す）
    pat = re.compile(r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ GET \S+ (成功|入力エラー|見つからない|期限切れ|失敗) \d{3}( \w+ [\w.]+:\d+ \w+)?$")
    for l in lines:
        assert pat.match(l), l
    assert [l.split(" ")[3] for l in lines] == ["成功", "入力エラー", "見つからない", "期限切れ", "失敗", "見つからない"]
    assert "GET /api/share-links/{share_id}" in lines[2] and "GET (該当なし)" in lines[5]
    assert "DbTimeout" in lines[4]
    # 出ないもの（標準のログ・自前のログ・キャプチャしたログのすべて）
    everything = out + "\n".join(r.getMessage() for r in caplog.records if r.name.startswith("giftia"))  # 自前のログ。テスト用の httpx のログは対象外
    forbidden = [r"\b(?:\d{1,3}\.){3}\d{1,3}\b", r"[0-9a-fA-F:]*:[0-9a-fA-F:]*:[0-9a-fA-F]+", "User-Agent", "Mozilla/", "Firefox",
                 "abc-secret-input", "送別", SECRET_ID, "gone1234567", "no/such", "testclient", "Referer"]
    everything = re.sub(r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ", "", everything, flags=re.MULTILINE)  # 時刻の「:」を IPv6 と取り違えない
    for f in forbidden:
        assert not re.search(f, everything), f


def test_uvicorn_access_log_is_off() -> None:
    logging_setup.setup_logging()
    assert logging.getLogger("uvicorn.access").disabled is True
    assert logging.getLogger(logging_setup.LOGGER_NAME).propagate is False
