# events.py — POST /api/events（設計.md D-40・D-41、仕様 SP-34、要件 N-13・N-16・N-09）
# 画面から匿名の計測（どの段まで進んだか）を 1 件受けて usage_events に 1 行だけ書く。名前・メール・IP・ブラウザの情報・商品 ID・検索語は受けない・持たない。
#  - 1 訪問 × 1 段で 1 行（UNIQUE (visit_id, step)。INSERT IGNORE）。重複は 204 のまま、重複かどうかを返さない。
#  - 本文は 1KB まで。形が合わない・知らない項目は 422 invalid_event（理由は返さない）。本文の is_test は無視する。
#  - テストの印（K-5）: 本文の test_key が環境変数 GIFTIA_TEST_KEY と一致したときだけ is_test=1。未設定・空の間は常に 0。
#    合っても外れても 204（当たり外れを外に見せない）。test_key の値は保存しない・ログに出さない（ログは時刻・API・結果だけ）。
#  - 失敗（DB 障害など）は 500 internal_error。ほかの API には影響しない（画面は結果を待たず、失敗しても何も出さない）。
import hmac
import json
import os
import re
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request, Response
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

from clock import Clock, get_clock
from config import SETTINGS
from db import Db, get_db

router = APIRouter()

TEST_KEY_ENV = "GIFTIA_TEST_KEY"  # 値は Azure のアプリの設定にだけ置く（PM。コード・文書・コミットに入れない）
ID_RE = re.compile(r"[A-Za-z0-9_-]{22}", re.ASCII)  # visit_id・visitor_id（16 バイトの乱数の base64url）
SCENES = ("お礼", "誕生日", "送別")
ENTRIES = ("top", "search", "detail", "share", "cart", "favorites", "other")
ZERO_CONDS = ("price", "category", "both", "scene_only")
STEPS = range(1, 8)  # 1〜6 は漏斗の段、7＝検索が 0 件
KNOWN = {"visit_id", "visitor_id", "step", "scene", "has_voice", "entry", "zero_cond", "test_key"}

INSERT_EVENT = (
    "INSERT IGNORE INTO usage_events (visit_id, visitor_id, step, occurred_at, scene, has_voice, entry, zero_cond, is_test) "
    "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)"
)


def _invalid() -> JSONResponse:
    return JSONResponse(
        {"error": {"code": "invalid_event", "message": "計測の形が正しくありません"}}, status_code=422
    )


def parse_event(raw: bytes) -> dict[str, Any] | None:
    """本文を検査して、保存する値（test_key 以外）と test_key を返す。合わなければ None。段に合わない項目は捨てる"""
    if len(raw) > SETTINGS.EVENT_BODY_MAX_BYTES:
        return None
    try:
        body = json.loads(raw)
    except (ValueError, RecursionError):
        return None
    if not isinstance(body, dict):
        return None
    body = {k: v for k, v in body.items() if k != "is_test"}  # 本文の is_test は無視する（N-09）
    if set(body) - KNOWN:  # 知らない項目（名前・メールなど）は受けない
        return None
    for key in ("visit_id", "visitor_id"):
        v = body.get(key)
        if not isinstance(v, str) or ID_RE.fullmatch(v) is None:
            return None
    step = body.get("step")
    if isinstance(step, bool) or not isinstance(step, int) or step not in STEPS:
        return None
    scene, voice, entry, zero = body.get("scene"), body.get("has_voice"), body.get("entry"), body.get("zero_cond")
    if scene is not None and scene not in SCENES:
        return None
    if entry is not None and entry not in ENTRIES:
        return None
    if zero is not None and zero not in ZERO_CONDS:
        return None
    if voice is not None and (not isinstance(voice, int) or isinstance(voice, bool) or voice not in (0, 1)):  # 0／1 だけ（設計 D-40。true／false は 422。画面 #306 も 0／1 で送る）
        return None
    test_key = body.get("test_key")
    if test_key is not None and (not isinstance(test_key, str) or len(test_key) > SETTINGS.TEST_KEY_MAX_LENGTH):
        return None
    return {
        "visit_id": body["visit_id"],
        "visitor_id": body["visitor_id"],
        "step": step,
        "scene": scene if step in (2, 3) else None,  # scene は段 2・3 だけ
        "has_voice": (None if voice is None else int(voice)) if step == 3 else None,  # 段 3 だけ
        "entry": entry if step == 1 else None,  # 段 1 だけ
        "zero_cond": zero if step == 7 else None,  # 段 7 だけ
        "test_key": test_key,
    }


def is_test_key(given: str | None) -> bool:
    """本文の test_key がサーバーの合言葉と一致するか。未設定・空・無しは常に False（値は比べるだけで残さない）"""
    secret = os.environ.get(TEST_KEY_ENV, "")
    if not secret or not given:
        return False
    return hmac.compare_digest(given.encode("utf-8"), secret.encode("utf-8"))


async def read_limited(request: Request) -> bytes | None:
    """本文を 1KB まで読む。Content-Length が 1KB を超えるなら読まずに None、無い・偽りでも 1KB を超えたところで読むのをやめて None（D-40）"""
    limit = SETTINGS.EVENT_BODY_MAX_BYTES
    declared = request.headers.get("content-length")
    if declared is not None and declared.isdigit() and int(declared) > limit:
        return None
    chunks = bytearray()
    async for chunk in request.stream():
        chunks += chunk
        if len(chunks) > limit:
            return None  # 残りは読まない
    return bytes(chunks)


@router.post("/api/events", response_model=None)
async def post_event(
    request: Request,
    db: Annotated[Db, Depends(get_db)],
    clock: Annotated[Clock, Depends(get_clock)],
) -> Response:
    """計測を 1 件受ける。204（本文なし。重複で捨てたかも返さない）／422 invalid_event／500"""
    raw = await read_limited(request)
    event = parse_event(raw) if raw is not None else None
    if event is None:
        return _invalid()
    occurred = clock.now().replace(microsecond=0, tzinfo=None).strftime("%Y-%m-%d %H:%M:%S")  # UTC。ブラウザの時計は使わない
    params = (
        event["visit_id"], event["visitor_id"], event["step"], occurred,
        event["scene"], event["has_voice"], event["entry"], event["zero_cond"],
        1 if is_test_key(event["test_key"]) else 0,
    )  # fmt: skip
    await run_in_threadpool(db.write, INSERT_EVENT, params)
    return Response(status_code=204)
