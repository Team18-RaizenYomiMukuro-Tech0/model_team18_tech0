# products.py — GET /api/products（設計.md D-28、R-02 の絞り込み。仕様 SP-10・SP-11）
# シーン・価格帯・カテゴリー・ページを受け、条件間 AND で、おすすめ順に 12 件ずつ返す。読み取りのみ。
#  - SQL は 1 本の固定の文。値はすべて %s と params で渡す（N-04）。SQL 文に値をつなげない。
#  - 並びは D-02 と同じ式（絞り込んだ商品で C を求める）。同点は商品ID順。送別回数は数えない（#46-2・#50-3）。
#  - 入力の検証は DB に問い合わせる前に行う（不正なら DB を呼ばない）。
import math
import re
from datetime import date
from decimal import Decimal
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from clock import Clock, get_clock
from config import SETTINGS
from db import Db, get_db
from decision import arrives_on, scene_count_value, scene_counts, today_jst
from ranking import order_by_score

router = APIRouter()

PAGE_SIZE = SETTINGS.PAGE_SIZE  # 1 ページの件数（D-28・N-14。config の値）

SCENES = ("お礼", "誕生日", "送別")
PRICE_BANDS: dict[str, tuple[int, int]] = {  # 税込の整数。下限・上限を含む（#49-1）
    "under3000": (0, 2999),
    "3000to4999": (3000, 4999),
    "5000plus": (5000, 2147483647),
}
NO_PRICE_LIMIT = (0, 2147483647)
CATEGORIES = (  # products.category の 10 種類（#54-5）。一字一句同じ値だけ受ける（#56-2）
    "生活雑貨",
    "食品",
    "コスメ",
    "飲料",
    "家電",
    "インテリア",
    "ビジネス小物",
    "フラワー",
    "酒類",
    "カタログギフト",
)
_CATEGORY_SLOTS = len(CATEGORIES)

# 固定の 1 本の文。条件が無いときは「フラグ ＝ 0」で外す（SQL 文を組み立てない）。
# 在庫 1 以上（NULL は出さない）、シーン、価格帯（下限・上限）、カテゴリー（選んだどれか。10 個分の差し込み位置）。
SELECT_PRODUCTS = (
    "SELECT p.product_id, p.product_name, p.price, p.category, p.rating, p.review_count, "
    "p.delivery_days, p.gift_wrap "
    "FROM products p "
    "WHERE p.stock >= 1 "
    "AND (%s = 0 OR p.product_id IN (SELECT s.product_id FROM product_scenes s WHERE s.scene_tag = %s)) "
    "AND p.price >= %s AND p.price <= %s "
    "AND (%s = 0 OR p.category IN (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s))"
)


def _error(code: str, message: str) -> JSONResponse:
    return JSONResponse({"error": {"code": code, "message": message}}, status_code=422)


def _high_rating(rating: Decimal | None) -> bool:
    """評価 4.5 以上。数値のまま比べる（4.49 は false。評価が無ければ false）"""
    return rating is not None and rating >= Decimal(str(SETTINGS.HIGH_RATING_MIN))


def _to_decimal(value: Any) -> Decimal | None:
    return None if value is None else Decimal(str(value))


def _item(
    row: dict[str, Any], today: date, scene: str | None = None, scene_n: int | None = None
) -> dict[str, Any]:
    """D-28 の 1 件分。arrives_on は今日（日本時間）＋配送日数、scene_count はシーンを付けたときだけ（D-34）"""
    rating = _to_decimal(row["rating"])
    wrap = row["gift_wrap"]
    return {
        "product_id": row["product_id"],
        "name": row["product_name"],
        "price": row["price"],
        "category": row["category"],
        "rating": None if rating is None else float(rating),
        "review_count": row["review_count"],
        "delivery_days": row["delivery_days"],
        "wrapping": None if wrap is None else bool(wrap),
        "high_rating": _high_rating(rating),
        "arrives_on": arrives_on(today, row["delivery_days"]),
        "scene_count": scene_count_value(scene, scene_n),
    }


@router.get("/api/products", response_model=None)
def list_products(
    request: Request,
    db: Annotated[Db, Depends(get_db)],
    clock: Annotated[Clock, Depends(get_clock)],
) -> Any:
    """絞り込み。不正な値は 422（invalid_scene / invalid_price_band / invalid_category / invalid_page）"""
    q = request.query_params  # budget など、ここで読まない名前は無視する（#51-4）

    scene: str | None = None
    if q.get("scene", "") != "":  # 空（scene=）はシーンの指定なし（決定。キックオフ記録 80）
        scene = q["scene"]
        if scene not in SCENES:
            return _error("invalid_scene", "scene は お礼・誕生日・送別 のどれかです")

    price_range = NO_PRICE_LIMIT
    band = q.get("price_band", "")
    if band != "":  # 空（price_band=）は価格帯なし（#49-5）
        if band not in PRICE_BANDS:
            return _error(
                "invalid_price_band",
                "price_band は under3000・3000to4999・5000plus のどれかです",
            )
        price_range = PRICE_BANDS[band]

    categories: list[str] = []
    for value in q.getlist("category"):
        if value.strip() == "":  # 空・空白だけは無視する（#59-2）
            continue
        if value not in CATEGORIES:  # 一字一句同じでなければ 422（#56-2）
            return _error("invalid_category", "category は決められた10種類のどれかです")
        if value not in categories:  # 重なりは 1 つにまとめる（#58-3）
            categories.append(value)

    page = 1
    if q.get("page", "") != "":  # 空（page=）は 1 ページ目（決定。キックオフ記録 80）
        raw = q["page"]
        if re.fullmatch(r"[0-9]+", raw, re.ASCII) is None or int(raw) < 1:
            return _error("invalid_page", "page は 1 以上の整数です")
        page = int(raw)

    slots = (
        categories + [categories[0]] * (_CATEGORY_SLOTS - len(categories))
        if categories
        else [""] * _CATEGORY_SLOTS
    )
    params: tuple[Any, ...] = (
        1 if scene is not None else 0,
        scene or "",
        price_range[0],
        price_range[1],
        1 if categories else 0,
        *slots,
    )
    rows = db.fetch_all(SELECT_PRODUCTS, params)

    by_id = {str(r["product_id"]): r for r in rows}
    ordered = order_by_score(
        [
            (str(r["product_id"]), _to_decimal(r["rating"]), r["review_count"])
            for r in rows
        ]
    )

    total = len(ordered)
    last_page = max(1, math.ceil(total / PAGE_SIZE))
    if page > last_page:  # 最後のページを超えたら 1 ページ目（#46-5）
        page = 1
    chosen = ordered[(page - 1) * PAGE_SIZE : page * PAGE_SIZE]
    today = today_jst(clock.now())
    counts = scene_counts(db, scene, chosen) if scene is not None else {}  # シーンがあるとき 12 件分を 1 本で数える（D-34）
    items = [_item(by_id[pid], today, scene, counts.get(pid, 0)) for pid in chosen]
    return {
        "items": items,
        "count": len(items),
        "total": total,
        "page": page,
        "page_size": PAGE_SIZE,
    }
