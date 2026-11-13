# share_links.py — POST /api/share-links（設計.md D-05・D-07・D-15、DATA-02、仕様 SP-05・SP-07）
# 選んだ商品 ID から、作成時点の商品名・価格・理由を保存した共有リンクを 1 件作る（POST）。
# GET /api/share-links/{share_id}（D-06、SP-06）は保存した値を返し、販売終了・在庫なしだけ開いた時点で商品テーブルを確かめる。
#  - 本文は商品 ID だけ。名前・価格・理由はサーバーが作成時点で作り直す（画面から受けた値を信用しない）。
#  - 検査の順: 型 → 配列の長さ（50）→ 重複を除く → 0 件 → 11 件以上 → 存在確認（U-33、NF-13）。
#  - 書き込みは share_links への INSERT 1 回だけ（Db.insert_share_link。N-04）。SQL はプレースホルダ。
#  - 時刻は Clock（D-11）、テスト用の印は get_test_mark（D-19）から受け取る。
import json
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

from api.candidates import (
    COUNT_SENDOFF_HEAD,
    COUNT_SENDOFF_TAIL,
    SENDOFF_SCENE,
    SENDOFF_SHIP_TO,
)
from clock import Clock, get_clock
from config import SETTINGS
from db import Db, DbError, get_db
from expiry import is_expired
from reasons import build_reason
from share_id import SHARE_ID_RE, new_share_id
from share_mark import get_test_mark

router = APIRouter()

SELECT_PRODUCTS_HEAD = (
    "SELECT p.product_id, p.product_name, p.price, p.rating, p.review_count, p.delivery_days, p.gift_wrap "
    "FROM products p WHERE p.product_id IN ("
)
SELECT_PRODUCTS_TAIL = ")"
SELECT_SHARE_LINK = "SELECT share_id, items, created_at FROM share_links WHERE share_id = %s"
SELECT_STOCK_HEAD = "SELECT p.product_id, p.stock FROM products p WHERE p.product_id IN ("
SELECT_STOCK_TAIL = ")"
INSERT_SHARE_LINK = "INSERT INTO share_links (share_id, items, created_at, is_test) VALUES (%s, %s, %s, %s)"

MAX_ID_RETRIES = 3  # 識別子が衝突したら作り直す（DATA-02）。乱数 122 ビットなので実際には起きない
DUPLICATE_KEY = "IntegrityError"  # Db は例外の種類名だけを持ち上げる


def _error(code: str, message: str) -> JSONResponse:
    return JSONResponse({"error": {"code": code, "message": message}}, status_code=422)


def _invalid() -> JSONResponse:
    return _error("invalid_product_ids", "product_ids は商品IDの配列で、存在する商品だけを指定してください")


def _parse_ids(raw: bytes) -> list[str] | JSONResponse:
    """本文を検査して、商品 ID の並び（重複込み）を返す。型が不正なら 422（invalid_product_ids）"""
    try:
        body = json.loads(raw)
    except ValueError:
        return _invalid()
    if not isinstance(body, dict) or not isinstance(body.get("product_ids"), list):
        return _invalid()
    ids: list[Any] = body["product_ids"]
    if not all(isinstance(i, str) for i in ids):  # 数値・小数・真偽値・null などは不正
        return _invalid()
    return [str(i) for i in ids]


def _create(ids: list[str], db: Db, clock: Clock, mark: int) -> JSONResponse:
    if len(ids) > SETTINGS.SHARE_REQUEST_MAX_LENGTH:  # 重複を除く前の長さ（H-23）
        return _error("too_many_items", "選べるのは10件までです")
    unique = list(dict.fromkeys(ids))  # 最初に出てきた順で重複を除く（H-23）
    if len(unique) == 0:
        return _error("empty_selection", "商品を1つ以上選んでください")
    if len(unique) > SETTINGS.SHARE_MAX_ITEMS:
        return _error("too_many_items", "共有リンクに入れられるのは10件までです")

    marks = ", ".join(["%s"] * len(unique))
    rows = db.fetch_all(SELECT_PRODUCTS_HEAD + marks + SELECT_PRODUCTS_TAIL, tuple(unique))
    by_id = {str(r["product_id"]): r for r in rows}
    if any(pid not in by_id for pid in unique):
        return _invalid()

    counts: dict[str, int] = {}
    sql = COUNT_SENDOFF_HEAD + marks + COUNT_SENDOFF_TAIL
    for r in db.fetch_all(sql, (SENDOFF_SCENE, SENDOFF_SHIP_TO, *unique)):
        counts[str(r["product_id"])] = int(r["n"])

    items = []
    for pid in unique:
        r = by_id[pid]
        wrap = r["gift_wrap"]
        items.append(
            {
                "product_id": pid,
                "name": r["product_name"],
                "price": r["price"],
                "reason": build_reason(
                    counts.get(pid, 0),
                    None if r["rating"] is None else Decimal(str(r["rating"])),
                    r["review_count"],
                    r["delivery_days"],
                    None if wrap is None else bool(wrap),
                ),
            }
        )

    created = clock.now().replace(microsecond=0, tzinfo=None)  # UTC、秒まで（DATA-02）
    created_text = created.strftime("%Y-%m-%d %H:%M:%S")
    items_json = json.dumps(items, ensure_ascii=False)
    for attempt in range(MAX_ID_RETRIES):
        share_id = new_share_id()
        try:
            db.insert_share_link(INSERT_SHARE_LINK, (share_id, items_json, created_text, mark))
            break
        except DbError as ex:
            if str(ex) != DUPLICATE_KEY or attempt == MAX_ID_RETRIES - 1:
                raise
    expires = created + timedelta(hours=SETTINGS.SHARE_EXPIRY_HOURS)
    return JSONResponse(
        {
            "share_id": share_id,
            "path": f"/s/{share_id}",
            "created_at": created.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "expires_at": expires.strftime("%Y-%m-%dT%H:%M:%SZ"),
        },
        status_code=201,
    )


# SP-05 SP-07 D-05 D-07 D-15
@router.post("/api/share-links", response_model=None)
async def create_share_link(
    request: Request,
    db: Annotated[Db, Depends(get_db)],
    clock: Annotated[Clock, Depends(get_clock)],
    mark: Annotated[int, Depends(get_test_mark)],
) -> Any:
    """共有リンクを毎回新しく 1 件作る。DB の呼び出しは別スレッドで行い、待ち中も他の要求を止めない"""
    ids = _parse_ids(await request.body())
    if isinstance(ids, JSONResponse):
        return ids
    return await run_in_threadpool(_create, ids, db, clock, mark)


def _not_found() -> JSONResponse:
    return JSONResponse({"error": {"code": "not_found", "message": "リンクが見つかりません"}}, status_code=404)


def _parse_created_at(value: Any) -> datetime:
    """DB の created_at（MySQL は datetime、偽の DB は文字列）を、時間帯なし（UTC）の時刻にする"""
    if isinstance(value, datetime):
        return value
    return datetime.strptime(str(value), "%Y-%m-%d %H:%M:%S")  # UTC の秒まで（DATA-02）


def _read(share_id: str, db: Db, clock: Clock) -> JSONResponse:
    if SHARE_ID_RE.fullmatch(share_id) is None:  # 形式が不正なら DB を引かずに、該当なしと同じ応答（D-06）
        return _not_found()
    rows = db.fetch_all(SELECT_SHARE_LINK, (share_id,))
    if not rows:
        return _not_found()
    created = _parse_created_at(rows[0]["created_at"])
    if is_expired(created, clock.now()):  # 期限切れなら商品は返さず、商品テーブルも見ない（#30 G）
        return JSONResponse({"error": {"code": "expired", "message": "このリンクは期限切れです"}}, status_code=410)

    raw = rows[0]["items"]
    stored: list[dict[str, Any]] = json.loads(raw) if isinstance(raw, str | bytes) else raw
    stocks: dict[str, Any] = {}
    if stored:
        marks = ", ".join(["%s"] * len(stored))
        sql = SELECT_STOCK_HEAD + marks + SELECT_STOCK_TAIL
        stocks = {str(r["product_id"]): r["stock"] for r in db.fetch_all(sql, tuple(i["product_id"] for i in stored))}

    items = []
    for item in stored:  # 保存した並び（選んだ順）のまま。名前・価格・理由は保存値（SP-06）
        pid = item["product_id"]
        if pid not in stocks:
            status = "discontinued"  # 商品テーブルに無い＝販売終了
        elif stocks[pid] is None or stocks[pid] < 1:
            status = "out_of_stock"  # 在庫 0（NULL も在庫なしとして扱う。R-02 と同じ）
        else:
            status = "available"
        items.append(
            {"product_id": pid, "status": status, "name": item["name"], "price": item["price"], "reason": item["reason"]}
        )
    expires = created + timedelta(hours=SETTINGS.SHARE_EXPIRY_HOURS)
    return JSONResponse(
        {
            "created_at": created.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "expires_at": expires.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "items": items,
        }
    )


# SP-06 D-06 D-11
@router.get("/api/share-links/{share_id}", response_model=None)
async def get_share_link(
    share_id: str,
    db: Annotated[Db, Depends(get_db)],
    clock: Annotated[Clock, Depends(get_clock)],
) -> Any:
    """共有リンクを開く。DB の呼び出しは別スレッドで行い、待ち中も他の要求を止めない"""
    return await run_in_threadpool(_read, share_id, db, clock)
