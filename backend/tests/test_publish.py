# #132（O1）のコードで置ける分（完了条件 3・4・6 のコード部分。N-07・D-16・N-13）
from pathlib import Path

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

import logging_setup
import main
import publish

BACKEND = Path(__file__).resolve().parent.parent
FRONT = "https://giftia-front.azurewebsites.net"
OTHER = "https://example.invalid"


def make_app(origin: str | None) -> FastAPI:
    app = FastAPI()
    logging_setup.install(app)  # main.py と同じ順（予期しない例外も 500 internal_error にして、noindex の内側で返す）
    publish.install(app, origin)

    @app.get("/api/ok")
    def ok() -> dict[str, int]:
        return {"n": 1}

    @app.post("/api/make")
    def make() -> dict[str, int]:
        return {"n": 2}

    @app.get("/api/gone")
    def gone() -> None:
        raise HTTPException(410, "expired")

    @app.get("/api/boom")
    def boom() -> None:
        raise RuntimeError("x")

    return app


def acao(r: object) -> str | None:
    return r.headers.get("access-control-allow-origin")  # type: ignore[attr-defined,no-any-return]  # テスト用の簡易な取り出し


def test_every_response_has_noindex() -> None:
    c = TestClient(make_app(FRONT), raise_server_exceptions=False)
    for method, path in (("get", "/api/ok"), ("post", "/api/make"), ("get", "/api/gone"), ("get", "/api/boom"),
                         ("get", "/none"), ("get", "/api/ok?x=1")):
        r = getattr(c, method)(path)
        assert r.headers["x-robots-tag"] == "noindex, nofollow", (path, r.status_code)
    pre = c.options("/api/make", headers={"Origin": FRONT, "Access-Control-Request-Method": "POST"})  # preflight
    assert pre.status_code == 200 and pre.headers["x-robots-tag"] == "noindex, nofollow"
    assert len(c.get("/api/ok").headers.get_list("x-robots-tag")) == 1  # 二重に付かない


def test_cors_allows_only_the_one_origin() -> None:
    c = TestClient(make_app(FRONT))
    assert acao(c.get("/api/ok", headers={"Origin": FRONT})) == FRONT
    assert acao(c.get("/api/ok", headers={"Origin": OTHER})) is None  # 別の Origin には付かない
    assert acao(c.get("/api/ok")) is None  # Origin なしにも付かない
    assert acao(c.get("/api/ok", headers={"Origin": FRONT + ".evil.test"})) is None  # 前方一致では通らない
    assert acao(c.get("/api/ok", headers={"Origin": "http://giftia-front.azurewebsites.net"})) is None  # http は別の送信元
    pre = c.options("/api/make", headers={"Origin": OTHER, "Access-Control-Request-Method": "POST"})
    assert pre.status_code == 400 and acao(pre) is None  # preflight も通さない
    ok = c.options("/api/make", headers={"Origin": FRONT, "Access-Control-Request-Method": "POST"})
    assert acao(ok) == FRONT
    assert "access-control-allow-credentials" not in ok.headers  # 認証情報つきの許可は使わない
    assert acao(c.get("/api/ok", headers={"Origin": "*"})) is None


@pytest.mark.parametrize("unset", [None, "", "   "])
def test_cors_unset_allows_nobody(unset: str | None) -> None:
    c = TestClient(make_app(publish.parse_allowed_origin(unset)))
    for o in (FRONT, OTHER, "*", "null"):
        assert acao(c.get("/api/ok", headers={"Origin": o})) is None
    assert c.get("/api/ok").headers["x-robots-tag"] == "noindex, nofollow"  # noindex は設定に関係なく付く


def test_parse_allowed_origin() -> None:
    assert publish.parse_allowed_origin(f" {FRONT} ") == FRONT
    assert publish.parse_allowed_origin("http://localhost:3000") == "http://localhost:3000"
    for bad in ("*", f"{FRONT}/", f"{FRONT},{OTHER}", "giftia-front.azurewebsites.net", f"{FRONT}/path", "https://*.azurewebsites.net"):
        with pytest.raises(ValueError):
            publish.parse_allowed_origin(bad)


def test_production_app_uses_the_env_variable(monkeypatch: pytest.MonkeyPatch) -> None:
    """本番の main.app: 環境変数 GIFTIA_ALLOWED_ORIGIN の 1 つだけ。古い CORS_ORIGINS は読まない"""
    src = (BACKEND / "main.py").read_text(encoding="utf-8")
    assert "CORS_ORIGINS" not in src and "CORSMiddleware" not in src
    assert "GIFTIA_ALLOWED_ORIGIN" in (BACKEND / "publish.py").read_text(encoding="utf-8")
    assert "GIFTIA_ALLOWED_ORIGIN" in (BACKEND / ".env.example").read_text(encoding="utf-8")
    c = TestClient(main.app, raise_server_exceptions=False)
    r = c.get("/api/health", headers={"Origin": FRONT})  # DB が無い環境では 500。ヘッダーは付く
    assert r.headers["x-robots-tag"] == "noindex, nofollow"
    assert acao(r) is None  # この環境では未設定


def test_startup_has_no_access_log() -> None:
    sh = (BACKEND / "startup.sh").read_text(encoding="utf-8")
    assert "--no-access-log" in sh and "uvicorn main:app" in sh
    assert "--reload" not in sh
