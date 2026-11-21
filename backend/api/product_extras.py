# product_extras.py — 詳細の欄に出す 2 つの API（設計.md D-35・D-42、仕様 SP-17・SP-25）
#  - GET /api/products/{product_id}/voices   贈った人の声（最大 2 件。D-35）
#  - GET /api/products/{product_id}/similar  同じシーン・同じ価格帯の商品（最大 3 件。D-42）
# どちらも読み取りのみ。SQL は固定の文で、値はすべて %s と params で渡す（N-04）。
# 形式が不正な値は DB を呼ばずに 422 を返す。
import time
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import JSONResponse

from api.product_detail import PRODUCT_ID_RE
from api.products import PRICE_BANDS, SCENES, _item
from clock import Clock, get_clock
from config import SETTINGS
from db import Db, get_db, server_timing
from decision import today_jst

router = APIRouter()

SIMILAR_MAX = 3  # D-42 の SQL の LIMIT。似た商品の最大件数（SP-25）

# D-35: 星 4 以上・本文あり（NULL・空白だけを除く）。同じ本文は 1 回（GROUP BY）、投稿日の新しい順、同じ日は本文の順。
# posted_at は並べるためだけに使い、応答には入れない。user_id・review_id は読まない（N-13）。
SELECT_VOICES = (
    "SELECT r.comment AS text, MAX(r.rating) AS rating, MAX(r.posted_at) AS posted_at "
    "FROM reviews r "
    "WHERE r.product_id = %s AND r.rating >= %s AND r.comment IS NOT NULL AND TRIM(r.comment) <> '' "
    "GROUP BY r.comment "
    "ORDER BY MAX(r.posted_at) DESC, r.comment "
    "LIMIT %s"
)

# D-35: ほかのシーンの言葉の一覧（手で書く。本文にその言葉が含まれるかで見る部分一致。PM 決定 2026-11-22 声-4。
# 「ありがとう」「感謝」「お祝い」「プレゼント」は、どのシーンの声にも出るので入れない）
SCENE_WORDS: dict[str, tuple[str, ...]] = {
    "お礼": ("お礼", "御礼"),
    "誕生日": ("誕生日", "バースデー"),
    "送別": ("送別", "退職", "異動", "転勤"),
}
_OTHER_SLOTS = max(len(sum((w for k, w in SCENE_WORDS.items() if k != s), ())) for s in SCENE_WORDS)  # 6

# scene を付けたとき: 上の WHERE に「ほかのシーンの言葉を含まない」を足す（LIMIT の前に効く。絞った後も最大件数）。
# 文は固定で、言葉は params（%言葉%）で渡す。足りない枠は先頭の言葉を繰り返す（同じ条件なので結果は変わらない）。
SELECT_VOICES_SCENE = SELECT_VOICES.replace(
    "AND TRIM(r.comment) <> '' ",
    "AND TRIM(r.comment) <> '' " + "".join("AND r.comment NOT LIKE %s " for _ in range(_OTHER_SLOTS)),
)


def _other_scene_patterns(scene: str) -> tuple[str, ...]:
    words = [w for k, ws in SCENE_WORDS.items() if k != scene for w in ws]
    words += [words[0]] * (_OTHER_SLOTS - len(words))
    return tuple(f"%{w}%" for w in words)


# 開いている商品の価格（価格帯を決める。無ければ 404）
SELECT_PRICE = "SELECT p.price FROM products p WHERE p.product_id = %s"

# D-42: 同じシーンのタグ・同じ価格帯・在庫 1 以上。開いている商品は除く。
# 評価の高い順（評価なしは後ろ）→ レビュー件数の多い順 → 商品 ID 順。
SELECT_SIMILAR = (
    "SELECT p.product_id, p.product_name, p.price, p.category, p.rating, p.review_count, "
    "p.delivery_days, p.gift_wrap "
    "FROM products p "
    "WHERE p.stock >= 1 AND p.product_id <> %s "
    "AND p.product_id IN (SELECT s.product_id FROM product_scenes s WHERE s.scene_tag = %s) "
    "AND p.price >= %s AND p.price <= %s "
    "ORDER BY (p.rating IS NULL), p.rating DESC, p.review_count DESC, LENGTH(p.product_id), p.product_id "
    "LIMIT %s"
)


def _error(code: str, message: str, status: int = 422) -> JSONResponse:
    return JSONResponse({"error": {"code": code, "message": message}}, status_code=status)


def _invalid_product_id() -> JSONResponse:
    return _error("invalid_product_id", "product_id の形式が正しくありません")


def _band_for(price: int) -> tuple[int, int]:
    """開いている商品の価格が入る価格帯の下限・上限（SP-25。〜2,999／3,000〜4,999／5,000〜）"""
    for low, high in PRICE_BANDS.values():
        if low <= price <= high:
            return low, high
    raise ValueError("価格帯に入らない価格")  # price は 0 以上の整数なので起きない


# SP-17 D-35
@router.get("/api/products/{product_id}/voices", response_model=None)
def get_voices(
    product_id: str, request: Request, response: Response, db: Annotated[Db, Depends(get_db)]
) -> Any:
    """贈った人の声。0〜2 件（0 件は []）。商品が無いときも 404 にせず []（404 は D-29 が返す）。
    scene（任意。お礼・誕生日・送別。省略・空は絞らない）を付けると、ほかのシーンの言葉を含む声を除いてから最大 2 件"""
    started = time.perf_counter()
    if PRODUCT_ID_RE.fullmatch(product_id) is None:
        return _invalid_product_id()
    scene = request.query_params.get("scene", "")
    if scene != "" and scene not in SCENES:
        return _error("invalid_scene", "scene は お礼・誕生日・送別 のどれかです")
    if scene == "":
        rows = db.fetch_all(SELECT_VOICES, (product_id, SETTINGS.VOICE_MIN_RATING, SETTINGS.VOICES_MAX))
    else:
        params = (product_id, SETTINGS.VOICE_MIN_RATING, *_other_scene_patterns(scene), SETTINGS.VOICES_MAX)
        rows = db.fetch_all(SELECT_VOICES_SCENE, params)
    response.headers["Server-Timing"] = server_timing(db, time.perf_counter() - started)  # 内訳（数値だけ。一覧と同じ。NF-54・#256）
    return {"voices": [{"text": r["text"], "rating": int(r["rating"])} for r in rows]}


# SP-25 D-42
@router.get("/api/products/{product_id}/similar", response_model=None)
def get_similar(
    product_id: str,
    request: Request,
    response: Response,
    db: Annotated[Db, Depends(get_db)],
    clock: Annotated[Clock, Depends(get_clock)],
) -> Any:
    """似た商品。scene は必須（お礼・誕生日・送別）。0 件は []。形式違い・scene なし・不正は 422、商品が無ければ 404"""
    started = time.perf_counter()
    if PRODUCT_ID_RE.fullmatch(product_id) is None:
        return _invalid_product_id()
    scene = request.query_params.get("scene", "")
    if scene not in SCENES:  # 無い・空・不正はどれも 422（シーンを選んでいない詳細では画面が呼ばない。D-42）
        return _error("invalid_scene", "scene は お礼・誕生日・送別 のどれかです")
    opened = db.fetch_all(SELECT_PRICE, (product_id,))
    if not opened:
        return _error("not_found", "この商品は見つかりません", 404)
    low, high = _band_for(int(opened[0]["price"]))
    rows = db.fetch_all(SELECT_SIMILAR, (product_id, scene, low, high, SIMILAR_MAX))
    today = today_jst(clock.now())
    response.headers["Server-Timing"] = server_timing(db, time.perf_counter() - started)  # 内訳（数値だけ。一覧と同じ。NF-54・#256）
    return {"items": [_item(r, today) for r in rows]}
