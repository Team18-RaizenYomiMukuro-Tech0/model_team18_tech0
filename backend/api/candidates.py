# candidates.py — GET /api/candidates（設計.md D-01・D-02・D-04、仕様 SP-01・SP-02）
# シーン（必須）・価格帯（任意）・カテゴリー（任意）で候補を抽出し、ベイズ平均で順位付けして上位 10 件を返す。読み取りのみ。
#  - SQL は固定の文。値はすべて %s と params で渡す（N-04）。入力の検証は DB に問い合わせる前に行う。
#  - 送別回数は、順位が決まる範囲（上位 10 件と 10 位と同点）の商品だけを注文データから都度数える（D-04・手順 6）。
#  - 理由の文は reasons.py（B4）。AI は使わない（ADR-003）。
import time
from decimal import Decimal
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import JSONResponse

from api.products import CATEGORIES, NO_PRICE_LIMIT, PRICE_BANDS, SCENES
from config import SETTINGS
from db import Db, get_db, server_timing
from ranking import candidate_pool, score_products, top_by_score_then_count
from reasons import build_reason

router = APIRouter()

_CATEGORY_SLOTS = len(CATEGORIES)

# 在庫 1 以上（NULL は出さない）、シーン、価格帯（下限・上限）、カテゴリー（選んだどれか。10 個分の差し込み位置）。
SELECT_CANDIDATES = (
    "SELECT p.product_id, p.product_name, p.price, p.category, p.rating, p.review_count, "
    "p.delivery_days, p.gift_wrap "
    "FROM products p "
    "WHERE p.stock >= 1 "
    "AND p.product_id IN (SELECT s.product_id FROM product_scenes s WHERE s.scene_tag = %s) "
    "AND p.price >= %s AND p.price <= %s "
    "AND (%s = 0 OR p.category IN (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s))"
)

# 送別回数（DATA-01）: 送別・会社宛ての注文の order_items を商品ごとに数える。gift_purpose は見ない（#54-4）。
# IN の中の「%s」は商品の数だけ並べる（値は params。SQL 文に値をつなげない）。
COUNT_SENDOFF_HEAD = (
    "SELECT oi.product_id AS product_id, COUNT(*) AS n "
    "FROM order_items oi JOIN orders o ON o.order_id = oi.order_id "
    "WHERE o.estimated_scene = %s AND o.ship_to_type = %s AND oi.product_id IN ("
)
COUNT_SENDOFF_TAIL = ") GROUP BY oi.product_id"
SENDOFF_SCENE = "送別"
SENDOFF_SHIP_TO = "会社"


def _error(code: str, message: str) -> JSONResponse:
    return JSONResponse({"error": {"code": code, "message": message}}, status_code=422)


def _to_decimal(value: Any) -> Decimal | None:
    return None if value is None else Decimal(str(value))


def _high_rating(rating: Decimal | None) -> bool:
    """評価 4.5 以上。数値のまま比べる（4.49 は false。評価が無ければ false）"""
    return rating is not None and rating >= Decimal(str(SETTINGS.HIGH_RATING_MIN))


@router.get("/api/candidates", response_model=None)
def list_candidates(request: Request, response: Response, db: Annotated[Db, Depends(get_db)]) -> Any:
    """候補の取得。不正な値は 422（invalid_price_band / invalid_scene / invalid_category）"""
    started = time.perf_counter()
    q = request.query_params  # budget など、ここで読まない名前は無視する（#51-4）

    price_range = NO_PRICE_LIMIT
    band = q.get("price_band", "")
    if band != "":  # 付けない・空（price_band=）は価格で絞らない（#49-3・5）
        if band not in PRICE_BANDS:
            return _error(
                "invalid_price_band",
                "price_band は under3000・3000to4999・5000plus のどれかです",
            )
        price_range = PRICE_BANDS[band]

    scene = q.get("scene", "")
    if scene not in SCENES:  # 空・付けない・「取引先」などは 422
        return _error("invalid_scene", "scene は お礼・誕生日・送別 のどれかです")

    categories: list[str] = []
    for value in q.getlist("category"):
        if value.strip() == "":  # 空・空白だけは無視する（#59-2）
            continue
        if value not in CATEGORIES:  # 一字一句同じでなければ 422（#56-2）
            return _error("invalid_category", "category は決められた10種類のどれかです")
        if value not in categories:  # 重なりは 1 つにまとめる（#58-3）
            categories.append(value)

    slots = (
        categories + [categories[0]] * (_CATEGORY_SLOTS - len(categories))
        if categories
        else [""] * _CATEGORY_SLOTS
    )
    params: tuple[Any, ...] = (
        scene,
        price_range[0],
        price_range[1],
        1 if categories else 0,
        *slots,
    )
    rows = db.fetch_all(SELECT_CANDIDATES, params)
    by_id = {str(r["product_id"]): r for r in rows}

    scores = score_products(
        [
            (str(r["product_id"]), _to_decimal(r["rating"]), r["review_count"])
            for r in rows
        ]
    )
    pool = candidate_pool(scores, SETTINGS.TOP_N)

    counts: dict[str, int] = {}
    if pool:
        sql = COUNT_SENDOFF_HEAD + ", ".join(["%s"] * len(pool)) + COUNT_SENDOFF_TAIL
        for r in db.fetch_all(sql, (SENDOFF_SCENE, SENDOFF_SHIP_TO, *pool)):
            counts[str(r["product_id"])] = int(r["n"])

    chosen = top_by_score_then_count(scores, counts, pool, SETTINGS.TOP_N)
    items = []
    for pid in chosen:
        r = by_id[pid]
        rating = _to_decimal(r["rating"])
        wrap = r["gift_wrap"]
        items.append(
            {
                "product_id": r["product_id"],
                "name": r["product_name"],
                "price": r["price"],
                "category": r["category"],
                "high_rating": _high_rating(rating),
                "reason": build_reason(
                    counts.get(pid, 0),
                    rating,
                    r["review_count"],
                    r["delivery_days"],
                    None if wrap is None else bool(wrap),
                ),
            }
        )
    response.headers["Server-Timing"] = server_timing(db, time.perf_counter() - started)  # 内訳（数値だけ。#256）
    return {"items": items, "count": len(items)}
