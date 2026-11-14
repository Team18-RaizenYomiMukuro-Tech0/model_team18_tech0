# ranking.py — おすすめ順の点数（設計.md D-02、仕様 SP-02）。B3（R-01）と共用する。
# 点数 ＝ v÷(v＋K)×R ＋ K÷(v＋K)×C（K は SETTINGS.BAYES_K）。
#  - R＝評価、v＝レビュー件数。評価か件数のどちらかが無い商品は v＝0（点数＝C）。
#  - C ＝ 絞り込んだ商品のうち、評価があり件数が1以上の商品だけの平均評価（件数0の商品は含めない。#37-5）。
#  - C に入れる商品が1つも無ければ、全員同点（点数 0）。
#  - 同点を正しく見分けるため、点数は分数（Fraction）で計算する（丸めない）。
from collections.abc import Sequence
from decimal import Decimal
from fractions import Fraction

from config import SETTINGS


def _fraction(value: Decimal | float | str) -> Fraction:
    return Fraction(str(value))


def score_products(
    items: Sequence[tuple[str, Decimal | float | None, int | None]],
) -> dict[str, Fraction]:
    """(商品ID, 評価, 件数) の並びから、商品IDごとの点数を返す。C は渡された商品の中で求める"""
    eligible = [
        (_fraction(r), v)
        for _, r, v in items
        if r is not None and v is not None and v >= 1
    ]
    if not eligible:
        return {pid: Fraction(0) for pid, _, _ in items}
    c = sum((r for r, _ in eligible), Fraction(0)) / len(eligible)
    k = SETTINGS.BAYES_K
    scores: dict[str, Fraction] = {}
    for pid, rating, count in items:
        if rating is not None and count is not None and count >= 1:
            scores[pid] = (
                Fraction(count, count + k) * _fraction(rating)
                + Fraction(k, count + k) * c
            )
        else:
            scores[pid] = c  # v＝0
    return scores


def order_by_score(
    items: Sequence[tuple[str, Decimal | float | None, int | None]],
) -> list[str]:
    """点数の高い順。同点は商品ID順（R-02。送別回数は数えない。#46-2・#50-3）"""
    scores = score_products(items)
    return sorted(scores, key=lambda pid: (-scores[pid], pid))


SORTS = ("recommend", "price_asc", "rating_desc", "delivery_asc")  # D-43。省略・空は recommend


# SP-21 D-43
def order_by_sort(
    items: Sequence[tuple[str, int, Decimal | float | None, int | None, int | None]],
    sort: str,
) -> list[str]:
    """(商品ID, 価格, 評価, レビュー件数, 配送日数) を D-43 の表のとおりに並べる。recommend はおすすめ順（D-02 の式）。
    NULL は後ろ（評価の高い順・配送日数の小さい順のとき最後）。同じ値は表の次の項目、最後は商品ID順"""
    if sort == "recommend":
        return order_by_score([(pid, rating, count) for pid, _, rating, count, _ in items])

    def rating_desc(rating: Decimal | float | None) -> tuple[int, Fraction]:
        return (1, Fraction(0)) if rating is None else (0, -_fraction(rating))  # 評価の高い順。なしは後ろ

    keys: dict[str, tuple[object, ...]] = {}
    for pid, price, rating, count, days in items:
        if sort == "price_asc":
            keys[pid] = (price, rating_desc(rating), pid)
        elif sort == "rating_desc":
            keys[pid] = (rating_desc(rating), -(count or 0), pid)
        elif sort == "delivery_asc":
            keys[pid] = ((1, 0) if days is None else (0, days), rating_desc(rating), pid)
        else:
            raise ValueError(sort)
    return sorted(keys, key=lambda pid: keys[pid])


# SP-02 D-01 D-02 手順5・6
def candidate_pool(scores: dict[str, Fraction], limit: int) -> list[str]:
    """送別回数を数える範囲: 点数の上位 limit 件と、limit 位と同点の商品（点数→商品ID順）"""
    ordered = sorted(scores, key=lambda pid: (-scores[pid], pid))
    if len(ordered) <= limit:
        return ordered
    cutoff = scores[ordered[limit - 1]]
    return [pid for pid in ordered if scores[pid] >= cutoff]


# SP-02 D-01 D-02 手順5
def top_by_score_then_count(
    scores: dict[str, Fraction],
    counts: dict[str, int],
    pool: Sequence[str],
    limit: int,
) -> list[str]:
    """点数の高い順 → 同点は送別回数の多い順 → なお同じなら商品ID順。上位 limit 件"""
    ordered = sorted(pool, key=lambda pid: (-scores[pid], -counts.get(pid, 0), pid))
    return ordered[:limit]
