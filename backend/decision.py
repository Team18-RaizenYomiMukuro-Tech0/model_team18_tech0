# decision.py — 決め手の値（設計.md D-34、仕様 SP-16・SP-26）: 選んだシーンの回数 scene_count と、届く日 arrives_on。
#  - 回数（D-04）: 送別＝推定シーン「送別」かつ会社宛て、お礼＝「ビジネスのお礼」（宛先を問わない）、
#    誕生日＝「友人への誕生日」と「家族への誕生日」の合計。「毎年決まった相手への贈答」は数えない。gift_purpose は見ない（#54-4）。
#  - 届く日（SP-26）: 発送日から配送日数の営業日後。締め時刻 15:00（日本時間。15:00:00 は締め後）より前の営業日の注文はその日に発送、
#    それ以外は翌営業日に発送。営業日は土日・祝日（手で書いた一覧）・年末年始（12/29〜1/3）を除く日。配送日数が無ければ None。
#  - SQL は固定の文。値は %s と params（N-04）。保存しない（都度数える）。
from collections.abc import Sequence
from datetime import date, datetime, time, timedelta, timezone
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


CUTOFF = time(15, 0)  # 締め時刻（日本時間。15:00:00 ちょうどは締め後。SP-26）

# 祝日の一覧（手で書く。外部サービスは使わない。2026・2027 年の祝日と振替休日・国民の休日。年末に翌年の分を足す。SP-26）。
# 年末年始（12/29〜1/3）は年を問わず休みなので一覧には入れない。一覧に無い年（2028 年以降）は土日と年末年始だけが休み。
HOLIDAYS: frozenset[date] = frozenset(
    date(y, m, d)
    for y, m, d in (
        (2026, 1, 1), (2026, 1, 12), (2026, 2, 11), (2026, 2, 23), (2026, 3, 20), (2026, 4, 29),
        (2026, 5, 3), (2026, 5, 4), (2026, 5, 5), (2026, 5, 6), (2026, 7, 20), (2026, 8, 11),
        (2026, 9, 21), (2026, 9, 22), (2026, 9, 23), (2026, 10, 12), (2026, 11, 3), (2026, 11, 23),
        (2027, 1, 1), (2027, 1, 11), (2027, 2, 11), (2027, 2, 23), (2027, 3, 21), (2027, 3, 22),
        (2027, 4, 29), (2027, 5, 3), (2027, 5, 4), (2027, 5, 5), (2027, 7, 19), (2027, 8, 11),
        (2027, 9, 20), (2027, 9, 23), (2027, 10, 11), (2027, 11, 3), (2027, 11, 23),
    )
)  # fmt: skip


def is_business_day(d: date) -> bool:
    """営業日＝土日・祝日・年末年始（12/29〜1/3）でない日"""
    if d.weekday() >= 5 or d in HOLIDAYS:
        return False
    return not ((d.month == 12 and d.day >= 29) or (d.month == 1 and d.day <= 3))


def _next_business_day(d: date) -> date:
    d += timedelta(days=1)
    while not is_business_day(d):
        d += timedelta(days=1)
    return d


def arrives_on(now: datetime, delivery_days: int | None) -> str | None:
    """届く日の目安 YYYY-MM-DD。now は Clock の現在時刻（UTC）。締め時刻は日本時間で判定する。
    配送日数が無ければ None（画面は出さない。OPEN-06）"""
    if delivery_days is None:
        return None
    local = now.astimezone(JST)
    ship = local.date() if is_business_day(local.date()) and local.time() < CUTOFF else _next_business_day(local.date())
    for _ in range(int(delivery_days)):
        ship = _next_business_day(ship)
    return ship.isoformat()
