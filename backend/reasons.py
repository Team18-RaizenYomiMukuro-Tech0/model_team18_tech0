# reasons.py — 理由の文を事実からつなげる（AI は使わない。ADR-003）。文言は reason_templates.py にだけ置く。
from decimal import Decimal

from config import SETTINGS
from reason_templates import BY_ID, SCENE_HEADS


# SP-03 D-03
def format_rating(rating: Decimal | float | str) -> str:
    """評価を丸めずに書く。4.0→「4.0」、4.49→「4.49」、4.6→「4.6」（S-36・U-27）。"""
    d = Decimal(str(rating)).normalize()
    if d == d.to_integral_value():
        d = d.quantize(Decimal("0.1"))
    return format(d, "f")


# SP-03 D-03
def build_reason(
    scene_count: int,
    rating: Decimal | float | str | None,
    review_count: int | None,
    delivery_days: int | None,
    wrapping: bool | None,
    scene: str = "送別",
) -> str:
    """材料の値があるものだけを、選んだシーンの回数→評価→配送の順につなぐ。値は作らない。
    回数 0 は回数の文を出さず、評価の文から始める（SP-03 第2弾）。scene は文の頭（送別「職場の送別で」・お礼・誕生日）"""
    rating_text = ""
    high = False
    if rating is not None and review_count is not None and review_count >= 1:
        rating_text = format_rating(rating)
        high = Decimal(str(rating)) >= Decimal(str(SETTINGS.HIGH_RATING_MIN))
    has_rating = rating_text != ""
    connect = scene_count >= 1 and has_rating and high

    parts: list[str] = []
    if scene_count >= 1:
        parts.append(BY_ID["TPL-01"] if connect else BY_ID["TPL-02"])

    if has_rating:
        if high:
            parts.append(BY_ID["TPL-04"] if connect else BY_ID["TPL-05"])
        else:
            parts.append(BY_ID["TPL-06"])

    if delivery_days is not None:
        parts.append(BY_ID["TPL-07"] if wrapping is True else BY_ID["TPL-08"])
    elif wrapping is True:
        parts.append(BY_ID["TPL-09"])

    return "".join(parts).format(head=SCENE_HEADS[scene], n=scene_count, r=rating_text, v=review_count, d=delivery_days)
