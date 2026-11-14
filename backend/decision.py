# decision.py — 決め手の値（設計.md D-34、仕様 SP-16・SP-26）: 選んだシーンの回数 scene_count と、届く日 arrives_on。
#  - 回数（D-04）: 送別＝推定シーン「送別」かつ会社宛て、お礼＝「ビジネスのお礼」（宛先を問わない）、
#    誕生日＝「友人への誕生日」と「家族への誕生日」の合計。「毎年決まった相手への贈答」は数えない。gift_purpose は見ない（#54-4）。
#  - 届く日: サーバーの今日（日本時間。Clock から）＋配送日数。土日・祝日・締め時刻は数えない（C-1）。配送日数が無ければ None。
#  - SQL は固定の文。値は %s と params（N-04）。保存しない（都度数える）。
from collections.abc import Sequence
from datetime import date, datetime, timedelta, timezone
from typing import Any

from db import Db

JST = timezone(timedelta(hours=9))

SENDOFF_SHIP_TO = "会社"
# シーン → (推定シーンの値, 会社宛てに限るか)。差し込み位置は 2 つなので、1 つだけのシーンは同じ値を 2 回渡す。
SCENE_ORDERS: dict[str, tuple[tuple[str, ...], bool]] = {
    "送別": (("送別",), True),
    "お礼": (("ビジネスのお礼",), False),
    "誕生日": (("友人への誕生日", "家族への誕生日"), False),
}

# 回数（DATA-01）: シーンの注文の order_items を商品ごとに数える。IN の中の「%s」は商品の数だけ並べる。
COUNT_HEAD = (
    "SELECT oi.product_id AS product_id, COUNT(*) AS n "
    "FROM order_items oi JOIN orders o ON o.order_id = oi.order_id "
    "WHERE o.estimated_scene IN (%s, %s) AND (%s = 0 OR o.ship_to_type = %s) AND oi.product_id IN ("
)
COUNT_TAIL = ") GROUP BY oi.product_id"


def scene_params(scene: str) -> tuple[Any, ...]:
    """回数の条件の差し込み値 4 つ（推定シーン 2 つ・会社宛てに限るか・宛先の値）"""
    tags, company_only = SCENE_ORDERS[scene]
    return tags[0], tags[-1], 1 if company_only else 0, SENDOFF_SHIP_TO


def scene_counts(db: Db, scene: str, product_ids: Sequence[str]) -> dict[str, int]:
    """商品 ID ごとの、選んだシーンの回数（注文が無い商品は入らない。呼び出し側は 0 とみなす）"""
    if not product_ids:
        return {}
    sql = COUNT_HEAD + ", ".join(["%s"] * len(product_ids)) + COUNT_TAIL
    return {str(r["product_id"]): int(r["n"]) for r in db.fetch_all(sql, (*scene_params(scene), *product_ids))}


def scene_count_value(scene: str | None, n: int | None) -> dict[str, Any] | None:
    """応答の scene_count。シーンが無ければ null"""
    return None if scene is None else {"scene": scene, "n": n or 0}


def today_jst(now: datetime) -> date:
    """Clock の現在時刻（UTC）から、日本時間の今日の日付"""
    return now.astimezone(JST).date()


def arrives_on(today: date, delivery_days: int | None) -> str | None:
    """届く日の目安 YYYY-MM-DD。配送日数が無ければ None（画面は出さない。OPEN-06）"""
    if delivery_days is None:
        return None
    return (today + timedelta(days=int(delivery_days))).isoformat()
