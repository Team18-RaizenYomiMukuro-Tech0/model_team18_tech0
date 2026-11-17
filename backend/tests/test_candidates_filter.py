# 完了条件 #1・#3（U-01〜U-03・U-09・U-10・U-22・U-34、I-27・I-28、設計.md D-01）: 抽出と 12 件ずつのページ（#418。以前は上位 10 件）。
# DB は使わない（偽の DB。SQL は本物と同じ文を流す）。
from typing import Any

from candidates_support import (
    CandidateDb,
    client_for,
    fd1,
    fd1_counts,
    fd2,
    ids,
    product,
)
from fastapi.testclient import TestClient


def test_band_3000to4999_returns_only_the_eight(fd1_client: TestClient) -> None:
    """U-01・I-01: 3,000〜4,999 円・送別は P01,P02,P03,P07,P08,P09,P10,P11 の 8 件。P04,P05,P06,P12,P13 は出ない"""
    got = ids(fd1_client, "scene=送別&price_band=3000to4999")
    assert sorted(got) == ["P01", "P02", "P03", "P07", "P08", "P09", "P10", "P11"]
    for out in ("P04", "P05", "P06", "P12", "P13"):
        assert out not in got


def test_band_edges(fd1_client: TestClient) -> None:
    """U-02・U-03: 2,999 は under3000 だけ、3,000 は 3000to4999 だけ、4,999 は 3000to4999 だけ、5,000 は 5000plus だけ"""
    under = ids(fd1_client, "scene=送別&price_band=under3000")
    mid = ids(fd1_client, "scene=送別&price_band=3000to4999")
    plus = ids(fd1_client, "scene=送別&price_band=5000plus")
    assert under == ["P04"]
    assert "P04" not in mid and "P02" in mid and "P02" not in under
    assert "P01" in mid and "P01" not in plus
    assert sorted(plus) == ["P05", "P13"]  # P05（5,000）は 5000plus、P12（在庫 0）は出ない


def test_out_of_stock_is_never_listed(fd1_client: TestClient) -> None:
    """P12（在庫 0）はどの条件でも出ない。C にも混ざらない（U-08・U-22）"""
    for q in ("scene=送別", "scene=送別&price_band=3000to4999", "scene=送別&price_band=under3000"):
        assert "P12" not in ids(fd1_client, q)
    for client in client_for(CandidateDb([product("S1", "送別", 0, 3500, 4.0, 10)])):
        assert ids(client, "scene=送別") == []  # 在庫 0 だけが該当 → 空
        assert ids(client, "scene=送別&price_band=3000to4999") == []


def test_all_twelve_on_one_page() -> None:
    """U-09（#418 で変更）: 12 件が該当するとき、全件が点数順に 1 ページに出る（A12 → A01）。以前の上位 10 件の切り捨てはない"""
    for client in client_for(CandidateDb(fd2())):
        got = ids(client, "scene=送別&price_band=3000to4999")
        assert got == [f"A{i:02d}" for i in range(12, 0, -1)]
        r = client.get("/api/candidates?scene=送別&price_band=3000to4999").json()
        assert (r["count"], r["total"], r["page"], r["page_size"]) == (12, 12, 1, 12)


def test_empty(fd1_client: TestClient) -> None:
    """U-10・I-28: 該当 0 件は空の一覧でエラーにならない（誕生日・under3000、在庫のあるお礼の商品が無いシーン）"""
    for q in ("scene=誕生日&price_band=under3000", "scene=お礼", "scene=お礼&price_band=5000plus"):
        r = fd1_client.get(f"/api/candidates?{q}")
        body = r.json()
        assert r.status_code == 200 and (body["items"], body["count"]) == ([], 0) and "relax" in body  # 0 件には relax（D-44）


def test_no_price_band_all_eleven() -> None:
    """U-34・I-27（#418 で変更）: 価格帯なし。在庫 1 以上の送別 11 件を価格で絞らず全件（P13 が先頭、P10 は 11 件目として出る）"""
    for client in client_for(CandidateDb(fd1(), fd1_counts())):
        got = ids(client, "scene=送別")
        assert got == ["P13", "P09", "P01", "P04", "P05", "P02", "P08", "P07", "P03", "P11", "P10"]
        assert "P06" not in got and "P12" not in got
        assert got == ids(client, "scene=送別&price_band=")  # 空の price_band= も同じ
        assert got == ids(client, "scene=送別&budget=4500")  # budget は読まずに無視


class LoggingDb(CandidateDb):
    """流した SQL と params を控える"""

    def __init__(self, *a: Any, **k: Any) -> None:
        super().__init__(*a, **k)
        self.log: list[tuple[str, tuple[Any, ...]]] = []

    def fetch_all(self, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        self.log.append((sql, params))
        return super().fetch_all(sql, params)


def test_sendoff_counts_cover_only_ranked_range() -> None:
    """設計 D-04: おすすめ順の回数は、表示するページまで（12 件）と 12 位と同点の商品だけ数える（全候補は数えない）"""
    products = [product(f"R{i:02d}", "送別", 1, 3500, 4.0 + i * 0.01, 20) for i in range(1, 16)]
    db = LoggingDb(products, {"R01": 3, "R02": 3})
    for client in client_for(db):
        assert ids(client, "scene=送別") == [f"R{i:02d}" for i in range(15, 0, -1)][:12]
    counted = [params for sql, params in db.log if "COUNT(*)" in sql]
    assert len(counted) == 1
    assert counted[0][:4] == ("送別", "送別", 1, "会社")  # 値は params で渡す（D-04。送別は会社宛てに限る）
    assert set(counted[0][4:]) == {f"R{i:02d}" for i in range(4, 16)}  # R01〜R03 は数えない
