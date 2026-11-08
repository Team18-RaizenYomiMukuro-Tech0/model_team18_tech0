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
