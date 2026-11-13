# product_detail.py — GET /api/products/{product_id}（設計.md D-29、仕様 SP-12・SP-14）
# 1 つの商品の詳細を返す。カートを開くときの販売終了・在庫なしの確認にも使う。読み取りのみ。
#  - 項目は D-28（絞り込み API）の 1 件分に、status・description（商品の特徴）・size（セット内容）を足したもの。
#  - 在庫 0 でも 404 にせず、商品情報と status＝out_of_stock を返す（#50-4・#53-5）。存在しなければ 404 not_found。
#  - SQL は固定の 1 本の文。値は %s と params で渡す（N-04）。形式が不正な ID は DB を呼ばずに 422。
import re
from typing import Annotated, Any

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from api.products import _item
from db import Db, get_db

router = APIRouter()

# products.product_id は varchar(10)。固定データ・実データの ID は「英大文字 1 字＋数字」（P12・C1・G0001）。
# 設計.md D-29 は「整数」と書くが、実際の ID は文字を含むため、この形式だけを受ける（`abc`・`1.5` などは 422）。
PRODUCT_ID_RE = re.compile(r"[A-Z][0-9]{1,9}", re.ASCII)

SELECT_PRODUCT = (
    "SELECT p.product_id, p.product_name, p.price, p.category, p.rating, p.review_count, "
    "p.delivery_days, p.gift_wrap, p.stock, p.description, p.size "
    "FROM products p WHERE p.product_id = %s"
)


def _text_or_none(value: Any) -> str | None:
    """値が無い（NULL・空）ときは null。画面は出さない（OPEN-06）"""
    return None if value is None or str(value).strip() == "" else str(value)


def _detail(row: dict[str, Any]) -> dict[str, Any]:
    stock = row["stock"]
    return {
        **_item(row),
        "status": "available" if stock is not None and stock >= 1 else "out_of_stock",
        "description": _text_or_none(row["description"]),
        "size": _text_or_none(row["size"]),
    }


# SP-12 SP-14 D-29
@router.get("/api/products/{product_id}", response_model=None)
def get_product(product_id: str, db: Annotated[Db, Depends(get_db)]) -> Any:
    """商品の詳細。形式が不正なら 422（invalid_product_id）、存在しなければ 404（not_found）"""
    if PRODUCT_ID_RE.fullmatch(product_id) is None:
        return JSONResponse(
            {"error": {"code": "invalid_product_id", "message": "product_id の形式が正しくありません"}},
            status_code=422,
        )
    rows = db.fetch_all(SELECT_PRODUCT, (product_id,))
    if not rows:
        return JSONResponse(
            {"error": {"code": "not_found", "message": "この商品は見つかりません"}}, status_code=404
        )
    return _detail(rows[0])
