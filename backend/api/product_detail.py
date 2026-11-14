# product_detail.py — GET /api/products/{product_id}（設計.md D-29、仕様 SP-12・SP-14）
# 1 つの商品の詳細を返す。カートを開くときの販売終了・在庫なしの確認にも使う。読み取りのみ。
#  - 項目は D-28（絞り込み API）の 1 件分に、status・description（商品の特徴）・size（セット内容）を足したもの。
#  - 在庫 0 でも 404 にせず、商品情報と status＝out_of_stock を返す（#50-4・#53-5）。存在しなければ 404 not_found。
#  - SQL は固定の 1 本の文。値は %s と params で渡す（N-04）。形式が不正な ID は DB を呼ばずに 422。
import re
from datetime import date
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from api.products import SCENES, _item
from clock import Clock, get_clock
from db import Db, get_db
from decision import scene_params, today_jst

router = APIRouter()

# products.product_id は varchar(10)。固定データ・実データの ID は「英大文字 1 字＋数字」（P12・C1・G0001）。
# 設計.md D-29 は「整数」と書くが、実際の ID は文字を含むため、この形式だけを受ける（`abc`・`1.5` などは 422）。
PRODUCT_ID_RE = re.compile(r"[A-Z][0-9]{1,9}", re.ASCII)

SELECT_PRODUCT = (
    "SELECT p.product_id, p.product_name, p.price, p.category, p.rating, p.review_count, "
    "p.delivery_days, p.gift_wrap, p.stock, p.description, p.size, "
    # 選んだシーンの回数（D-34）。シーンが無いとき（先頭の %s が 0）は数えない。商品の SELECT に足すので DB への往復は増えない
    "CASE WHEN %s = 0 THEN NULL ELSE (SELECT COUNT(*) FROM order_items oi JOIN orders o ON o.order_id = oi.order_id "
    "WHERE oi.product_id = p.product_id AND o.estimated_scene IN (%s, %s) AND (%s = 0 OR o.ship_to_type = %s)) END AS scene_n "
    "FROM products p WHERE p.product_id = %s"
)


def _text_or_none(value: Any) -> str | None:
    """値が無い（NULL・空）ときは null。画面は出さない（OPEN-06）"""
    return None if value is None or str(value).strip() == "" else str(value)


def _detail(row: dict[str, Any], today: date, scene: str | None) -> dict[str, Any]:
    stock = row["stock"]
    return {
        **_item(row, today, scene, row["scene_n"]),
        "status": "available" if stock is not None and stock >= 1 else "out_of_stock",
        "description": _text_or_none(row["description"]),
        "size": _text_or_none(row["size"]),
    }


# SP-12 SP-14 D-29
@router.get("/api/products/{product_id}", response_model=None)
def get_product(
    product_id: str,
    request: Request,
    db: Annotated[Db, Depends(get_db)],
    clock: Annotated[Clock, Depends(get_clock)],
) -> Any:
    """商品の詳細。形式が不正なら 422（invalid_product_id・invalid_scene）、存在しなければ 404（not_found）。
    scene（任意。お礼・誕生日・送別）を付けると scene_count を返す（D-34）。空・無しは指定なし"""
    if PRODUCT_ID_RE.fullmatch(product_id) is None:
        return JSONResponse(
            {"error": {"code": "invalid_product_id", "message": "product_id の形式が正しくありません"}},
            status_code=422,
        )
    scene: str | None = None
    if request.query_params.get("scene", "") != "":  # 空（scene=）はシーンの指定なし（D-28 と同じ）
        scene = request.query_params["scene"]
        if scene not in SCENES:
            return JSONResponse(
                {"error": {"code": "invalid_scene", "message": "scene は お礼・誕生日・送別 のどれかです"}},
                status_code=422,
            )
    flag = 1 if scene is not None else 0
    tags = scene_params(scene) if scene is not None else ("", "", 0, "")
    rows = db.fetch_all(SELECT_PRODUCT, (flag, *tags, product_id))
    if not rows:
        return JSONResponse(
            {"error": {"code": "not_found", "message": "この商品は見つかりません"}}, status_code=404
        )
    return _detail(rows[0], today_jst(clock.now()), scene)
