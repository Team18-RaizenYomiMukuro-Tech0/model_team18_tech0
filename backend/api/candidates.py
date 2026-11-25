# candidates.py — GET /api/candidates（設計.md D-01・D-02・D-04、仕様 SP-01・SP-02）
# シーン（必須）・価格帯（任意）・カテゴリー（任意）で候補を抽出し、並びの順に全件を 12 件ずつのページで返す（PM 決定 2026-11-17「1A」）。読み取りのみ。
#  - page（1 以上の整数。省略・空は 1。最後を超えたら 1 ページ目。D-28 と同じ）・sort（D-43 の 4 つと scene_count_desc。省略・空は recommend）。
#  - SQL は固定の文。値はすべて %s と params で渡す（N-04）。入力の検証は DB に問い合わせる前に行う。
#  - 選んだシーンの回数は、1 回の集計で数える（D-04）。おすすめ順のときは表示するページまでの商品と境目と同点の商品だけ、
#    回数順のときは全候補。回数は同点の並びと理由の文・決め手 scene_count に使う。
#    回数は同点の並びと理由の文・決め手 scene_count に使う（D-34。送別＝会社宛て、お礼、誕生日は decision.py）。
#  - 理由の文は reasons.py（B4）。AI は使わない（ADR-003）。
import math
import re
import time
from collections.abc import Sequence
from decimal import Decimal
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import JSONResponse

from api.products import CATEGORIES, NO_PRICE_LIMIT, PRICE_BANDS, SCENES, relax_counts
from catalog import Catalog, get_catalog
from clock import Clock, get_clock
from config import SETTINGS
from db import Db, get_db, server_timing
from decision import arrives_on, scene_count_value, scene_counts
from ranking import (
    SCENE_COUNT_DESC,
    SORTS,
    candidate_pool,
    order_by_scene_count,
    order_by_sort,
    score_products,
    top_by_score_then_count,
)
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


def _error(code: str, message: str) -> JSONResponse:
    return JSONResponse({"error": {"code": code, "message": message}}, status_code=422)


def _to_decimal(value: Any) -> Decimal | None:
    return None if value is None else Decimal(str(value))


def _high_rating(rating: Decimal | None) -> bool:
    """評価 4.5 以上。数値のまま比べる（4.49 は false。評価が無ければ false）"""
    return rating is not None and rating >= Decimal(str(SETTINGS.HIGH_RATING_MIN))


@router.get("/api/candidates", response_model=None)
def list_candidates(
    request: Request,
    response: Response,
    db: Annotated[Db, Depends(get_db)],
    clock: Annotated[Clock, Depends(get_clock)],
    catalog: Annotated[Catalog, Depends(get_catalog)],
) -> Any:
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

    page = 1
    if q.get("page", "") != "":  # 空（page=）は 1 ページ目（D-28 と同じ）
        raw = q["page"]
        if re.fullmatch(r"[0-9]+", raw, re.ASCII) is None or int(raw) < 1:
            return _error("invalid_page", "page は 1 以上の整数です")
        page = int(raw)

    sort = q.get("sort", "") or "recommend"  # 空・無しはおすすめ順（D-43）
    if sort not in SORTS and sort != SCENE_COUNT_DESC:
        return _error(
            "invalid_sort",
            "sort は recommend・price_asc・rating_desc・delivery_asc・scene_count_desc のどれかです",
        )

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
    snap = catalog.current(db, clock)  # メモリが使えれば SQL は 0 本。空の間は今の道（D-50。入力の検証のあとなので、不正な入力では読み込みも始めない）
    rows = snap.select(scene, price_range, categories) if snap is not None else db.fetch_all(SELECT_CANDIDATES, params)

    def count_of(ids: Sequence[str]) -> dict[str, int]:
        return snap.scene_counts(scene, ids) if snap is not None else scene_counts(db, scene, ids)

    by_id = {str(r["product_id"]): r for r in rows}

    scores = score_products(
        [
            (str(r["product_id"]), _to_decimal(r["rating"]), r["review_count"])
            for r in rows
        ]
    )
    size = SETTINGS.CANDIDATE_PAGE_SIZE
    total = len(rows)
    if page > max(1, math.ceil(total / size)):  # 最後のページを超えたら 1 ページ目（D-28 と同じ。#46-5。PM 決定 2026-11-17「1A」）
        page = 1
    start, end = (page - 1) * size, page * size

    if sort == SCENE_COUNT_DESC:  # 回数順は全候補の回数が要る（1 回の集計。D-04）
        counts = count_of(list(scores))
        ordered = order_by_scene_count(scores, counts)
    elif sort == "recommend":  # 表示するページまでと、その境目と同点の商品だけ数える（D-04）
        pool = candidate_pool(scores, min(end, total))
        counts = count_of(pool)  # 1 回の集計
        ordered = top_by_score_then_count(scores, counts, pool, end)
    else:  # 価格・評価・配送日数の順（D-43。同じ値は商品ID順）。回数は表示する分だけ数える
        ordered = order_by_sort(
            [
                (str(r["product_id"]), r["price"], _to_decimal(r["rating"]), r["review_count"], r["delivery_days"])
                for r in rows
            ],
            sort,
        )
        counts = {}
    chosen = ordered[start:end]
    if sort not in ("recommend", SCENE_COUNT_DESC):
        counts = count_of(chosen)
    now = clock.now()
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
                "rating": None if rating is None else float(rating),
                "review_count": r["review_count"],
                "delivery_days": r["delivery_days"],
                "wrapping": None if wrap is None else bool(wrap),
                "arrives_on": arrives_on(now, r["delivery_days"]),
                "scene_count": scene_count_value(scene, counts.get(pid, 0)),
                "reason": build_reason(
                    counts.get(pid, 0),
                    rating,
                    r["review_count"],
                    r["delivery_days"],
                    None if wrap is None else bool(wrap),
                    scene,
                ),
            }
        )
    body: dict[str, Any] = {"items": items, "count": len(items), "total": total, "page": page, "page_size": size}
    if total == 0:  # 0 件のときだけ助け舟の件数（D-44。同じ関数。シーンははずさない。+1 往復）
        body["relax"] = (
            snap.relax_counts(scene, price_range if band != "" else None, categories)
            if snap is not None
            else relax_counts(db, scene, price_range if band != "" else None, categories)
        )
    response.headers["Server-Timing"] = server_timing(db, time.perf_counter() - started)  # 内訳（数値だけ。#256）
    return body
