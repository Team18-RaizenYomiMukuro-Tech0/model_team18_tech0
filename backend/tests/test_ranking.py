# 完了条件 #2（U-04〜U-08・U-11・U-23・U-24・U-32、設計.md D-02）: 点数と並び。
# 点数は ranking.py を直接、並びは API 経由で確かめる。DB は使わない（偽の DB）。
from fractions import Fraction

from candidates_support import (
    CandidateDb,
    client_for,
    fd1,
    fd1_counts,
    fd4,
    fd5,
    fd6,
    ids,
)
from fastapi.testclient import TestClient

from ranking import candidate_pool, score_products, top_by_score_then_count

FD1_BAND = ["P01", "P02", "P03", "P07", "P08", "P09", "P10", "P11"]


def band_scores() -> dict[str, Fraction]:
    rows = {p["id"]: p for p in fd1()}
    items = [(pid, rows[pid]["rating"], rows[pid]["count"]) for pid in FD1_BAND]
    return score_products(items)


def test_scores_match_hand_calculation() -> None:
    """U-04・U-06・U-07・U-32: 3000to4999 の点数が試算値と ±0.001。C は 4.115（P07・P03 は平均に入れない）"""
    s = {k: float(v) for k, v in band_scores().items()}
    expected = {"P09": 4.531, "P01": 4.3075, "P02": 4.3025, "P08": 4.217, "P07": 4.115, "P03": 4.115, "P11": 3.505, "P10": 3.319}
    for pid, want in expected.items():
        assert abs(s[pid] - want) <= 0.001, (pid, s[pid], want)
    assert abs(s["P01"] - 4.3075) < 1e-9  # U-07: 件数 20 は (R + C) ÷ 2
    assert s["P07"] == s["P03"]  # 件数 0・評価欠損は点数＝C（0 割りも起きない）
    assert abs(s["P03"] - 4.115) < 1e-9  # U-32: C がちょうど 4.115


def test_p09_beats_p08() -> None:
    """U-05（F-01a）: 評価 4.9・3 件より評価 4.6・120 件が上"""
    s = band_scores()
    assert s["P09"] > s["P08"]


def test_order_fd1_band(fd1_client: TestClient) -> None:
    """U-04: 順位は P09, P01, P02, P08, P07, P03, P11, P10（P07 と P03 は同点で、送別回数が多い P07 が上）"""
    assert ids(fd1_client, "scene=送別&price_band=3000to4999") == ["P09", "P01", "P02", "P08", "P07", "P03", "P11", "P10"]


def test_c_ignores_out_of_stock(fd1_client: TestClient) -> None:
    """U-08: 在庫 0 の P12（評価 1.0）は C に混ざらない。P12 を抜いた集合と順が同じ"""
    with_p12 = ids(fd1_client, "scene=送別&price_band=3000to4999")
    for client in client_for(CandidateDb([p for p in fd1() if p["id"] != "P12"], fd1_counts())):
        assert ids(client, "scene=送別&price_band=3000to4999") == with_p12


def test_tie_goes_to_sendoff_count_then_id() -> None:
    """U-11: FD-4 は T3（送別回数 9）→ T1 → T2（回数が同じなら商品ID順）"""
    for client in client_for(CandidateDb(fd4(), {"T1": 5, "T2": 5, "T3": 9})):
        assert ids(client, "scene=送別") == ["T3", "T1", "T2"]


def test_missing_rating_or_count_scores_as_c() -> None:
    """U-23: FD-5 は Q3, Q2, Q1, Q4。Q3 4.2 / Q1・Q2 4.0 / Q4 3.8。C は Q3・Q4 だけの平均 4.0"""
    for client in client_for(CandidateDb(fd5(), {"Q1": 2, "Q2": 6, "Q3": 1, "Q4": 1})):
        assert ids(client, "scene=送別") == ["Q3", "Q2", "Q1", "Q4"]
    rows = {p["id"]: p for p in fd5()}
    s = {k: float(v) for k, v in score_products([(k, rows[k]["rating"], rows[k]["count"]) for k in rows]).items()}
    assert abs(s["Q3"] - 4.2) < 1e-9 and abs(s["Q4"] - 3.8) < 1e-9 and s["Q1"] == s["Q2"] == 4.0


def test_no_ratings_at_all() -> None:
    """U-24: 全候補に評価が無い（FD-6）。エラーにならず全員同点で、V2（回数 9）→ V1 → V3"""
    for client in client_for(CandidateDb(fd6(), {"V1": 4, "V2": 9, "V3": 4})):
        assert ids(client, "scene=送別") == ["V2", "V1", "V3"]


def test_pool_includes_ties_at_the_cutoff() -> None:
    """設計 手順 6: 10 位と同点の商品も回数を数える範囲に入る。範囲外の商品は入らない"""
    scores = {f"X{i:02d}": Fraction(20 - i) for i in range(1, 9)}
    scores |= {"Y1": Fraction(10), "Y2": Fraction(10), "Y3": Fraction(10), "Z": Fraction(1)}
    pool = candidate_pool(scores, 10)  # 10 位は Y2 の点数 10。同点の Y3 まで入る
    assert "Y3" in pool and "Z" not in pool
    top = top_by_score_then_count(scores, {"Y3": 5}, pool, 10)
    assert top[8:] == ["Y3", "Y1"] and "Y2" not in top  # 同点の Y1・Y2・Y3 のうち、回数の多い Y3 が先。10 件で切る
