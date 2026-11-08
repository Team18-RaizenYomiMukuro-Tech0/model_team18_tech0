# publish.py — 公開版の API の設定（設計.md N-07・D-16・D-33、運営の回答 #65）
#  - 全応答（成功も失敗も、preflight も）に X-Robots-Tag: noindex, nofollow を付ける（検索エンジンに載せない）
#  - CORS: 許す送信元は環境変数 GIFTIA_ALLOWED_ORIGIN の 1 つだけ。未設定なら許さない。* は使わない。認証情報つきの許可も使わない
import re

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.types import ASGIApp, Message, Receive, Scope, Send

ROBOTS_VALUE = "noindex, nofollow"  # 設計.md N-07 の 1（値はこのまま）
ALLOWED_ORIGIN_ENV = "GIFTIA_ALLOWED_ORIGIN"
_ORIGIN_RE = re.compile(r"^https?://[A-Za-z0-9.-]+(:\d+)?$")  # 送信元は「https://ホスト名」の形（末尾の / ・パス・* ・複数は不可）


def parse_allowed_origin(value: str | None) -> str | None:
    """環境変数の値を、許す送信元 1 つにする。空・未設定は None（許さない）。形が違えば起動時に止める"""
    v = (value or "").strip()
    if not v:
        return None
    if not _ORIGIN_RE.match(v):
        raise ValueError(f"{ALLOWED_ORIGIN_ENV} は https://ホスト名 の1つだけを書いてください（* ・複数・末尾の / は使えません）")
    return v


class NoindexMiddleware:
    """どの応答（エラー・preflight を含む）にも X-Robots-Tag を付ける"""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_header(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = [(k, v) for k, v in message.get("headers", []) if k.lower() != b"x-robots-tag"]
                headers.append((b"x-robots-tag", ROBOTS_VALUE.encode("ascii")))
                message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, send_with_header)


def install(app: FastAPI, allowed_origin: str | None) -> None:
    """CORS（許す送信元 1 つだけ）と noindex を入れる。noindex は一番外側（CORS の応答にも付く）"""
    origins = [allowed_origin] if allowed_origin else []
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=False,
        allow_methods=["GET", "POST"],  # 設計.md の API は GET と POST（D-01・D-05・D-06 ほか）
        allow_headers=["Content-Type"],
    )
    app.add_middleware(NoindexMiddleware)
