# 完了条件 #1〜#4（理由の文。仕様 SP-03、設計 D-03、テスト設計 FD-8）
from decimal import Decimal

from reasons import build_reason

X1 = "職場の送別で48回選ばれていて、評価も4.6（120件）と高めです。2日で届き、ラッピングもできます。"
X2 = "職場の送別で12回選ばれています。評価は4.2（30件）です。3日で届きます。"
X3 = "評価は4.0（8件）です。2日で届きます。"  # 回数 0 は回数の文を出さず、評価の文から始める（SP-03 第2弾）
X4 = "評価は4.7（50件）と高めです。"


# SP-03 D-03 U-12 U-13 U-29
def test_examples() -> None:
    assert build_reason(48, Decimal("4.6"), 120, 2, True) == X1
    s3 = build_reason(0, Decimal("4.0"), 8, 2, False)
    assert s3 == X3
    assert "0回" not in s3
    assert build_reason(0, Decimal("4.7"), 50, None, None) == X4


# SP-03 D-03 U-26 U-27
def test_high_rating() -> None:
    assert "と高めです" in build_reason(12, Decimal("4.5"), 20, 2, True)  # P01
    p02 = build_reason(5, Decimal("4.49"), 20, 3, False)
    assert "と高めです" not in p02
    assert "評価は4.49（20件）です" in p02
    assert build_reason(12, Decimal("4.2"), 30, 3, False) == X2  # X2


# SP-03 D-03 U-14 U-30
def test_missing_rating() -> None:
    for count, rating, reviews in ((3, None, 0), (7, Decimal("4.5"), 0)):  # P03, P07
        s = build_reason(count, rating, reviews, 2, True)
        assert "評価" not in s and "件" not in s
        assert "なし" not in s and "欠損" not in s
        assert f"{count}回選ばれています。" in s
        assert "2日で届き、ラッピングもできます。" in s


# SP-03 D-03 U-31
def test_wrap() -> None:
    assert build_reason(12, Decimal("4.2"), 30, 3, False) == X2  # X2（不可）
    assert build_reason(12, Decimal("4.2"), 30, 3, None) == X2  # X5（値なし）
    assert "ラッピング" not in X2
