# Issue #281（D2）: 決め手の値 arrives_on・scene_count と、選んだシーンの回数による R-01 の並び・理由の文。
# テスト設計 U-59〜U-61・U-67〜U-70・U-73、I-41〜I-43・I-45〜I-47・I-59。DB は使わない（偽の DB。SQL は本物と同じ文）。
from collections.abc import Iterator
from datetime import UTC, date, datetime
from typing import Any

import pytest
from candidates_support import CandidateDb, product
from fastapi.testclient import TestClient

import main
from clock import get_clock
from db import get_db
from decision import arrives_on, scene_counts, today_jst
from reasons import build_reason


class Fixed:
    """固定の Clock（テストのコードの中だけで差し替える。D-11）"""

    def __init__(self, now: datetime) -> None:
        self._now = now

    def now(self) -> datetime:
        return self._now


def client_at(db: CandidateDb, now: datetime) -> Iterator[TestClient]:
    main.app.dependency_overrides[get_db] = lambda: db
    main.app.dependency_overrides[get_clock] = lambda: Fixed(now)
    try:
        yield TestClient(main.app)
    finally:
        main.app.dependency_overrides.clear()


NOV15 = datetime(2026, 11, 15, 3, 0, tzinfo=UTC)  # 日本時間 11/15 12:00


def with_detail_columns(db: CandidateDb) -> CandidateDb:
    """詳細の API が読む description・size の列を足す（本物の products にある列）"""
    db.raw.execute("ALTER TABLE products ADD COLUMN description TEXT")
    db.raw.execute("ALTER TABLE products ADD COLUMN size TEXT")
    return db


def add_scenes(db: CandidateDb, pid: str, *scenes: str) -> None:
    for s in scenes:
        db.raw.execute("INSERT INTO product_scenes VALUES (?,?)", (pid, s))


# U-73 D-34: 届く日（日本時間の今日＋配送日数。月・年・うるう年をまたぐ）
def test_arrives_on_dates() -> None:
    cases = [
        (date(2026, 11, 15), 2, "2026-11-17"),
        (date(2026, 11, 30), 2, "2026-12-02"),
        (date(2026, 12, 31), 2, "2027-01-02"),
        (date(2028, 2, 28), 2, "2028-03-01"),  # 2028 年はうるう年（2/29 を通る）
        (date(2027, 2, 28), 2, "2027-03-02"),
        (date(2026, 11, 15), 0, "2026-11-15"),
        (date(2026, 11, 15), None, None),
    ]
    for today, days, want in cases:
        assert arrives_on(today, days) == want


def test_today_is_japan_time() -> None:
    assert today_jst(datetime(2026, 11, 14, 15, 30, tzinfo=UTC)) == date(2026, 11, 15)  # UTC 15:30 は日本時間の翌日 0:30
    assert today_jst(datetime(2026, 11, 14, 14, 59, tzinfo=UTC)) == date(2026, 11, 14)


# U-68 D-04: 回数の数え方（宛先・gift_purpose・対象外の推定シーン）
def test_scene_count_rules() -> None:
    db = CandidateDb([product("X", "送別", 1, 3500, 4.0, 10)])
    for scene, ship in (
        ("送別", "会社"), ("送別", "自宅"), ("ビジネスのお礼", "会社"), ("ビジネスのお礼", "自宅"),
        ("友人への誕生日", "自宅"), ("家族への誕生日", "自宅"), ("毎年決まった相手への贈答", "会社"),
    ):  # fmt: skip
        db.add_order("X", scene, ship)
    db.add_order("X", "その他", "会社", purpose="送別")  # gift_purpose だけが送別・お礼の注文は数えない
    db.add_order("X", "その他", "自宅", purpose="お礼")
    assert scene_counts(db, "送別", ["X"]) == {"X": 1}
    assert scene_counts(db, "お礼", ["X"]) == {"X": 2}
    assert scene_counts(db, "誕生日", ["X"]) == {"X": 2}
    assert scene_counts(db, "誕生日", ["Y"]) == {}  # 注文が無い商品は入らない（呼び出し側は 0）
    assert scene_counts(db, "送別", []) == {}


def _fd11() -> CandidateDb:
    """FD-11: 評価・件数が同じ R1〜R3。シーンごとの回数が違う"""
    db = CandidateDb([product(f"R{i}", "送別", 1, 3500, 4.0, 20) for i in (1, 2, 3)])
    for pid in ("R1", "R2", "R3"):
        add_scenes(db, pid, "お礼", "誕生日")
    plan = {"R1": (2, 2, 3), "R2": (1, 3, 1), "R3": (3, 1, 2)}  # (送別, お礼, 誕生日) の回数
    for pid, (s, t, b) in plan.items():
        for _ in range(s):
            db.add_order(pid, "送別", "会社")
        for _ in range(t):
            db.add_order(pid, "ビジネスのお礼", "自宅")
        for i in range(b):
            db.add_order(pid, "友人への誕生日" if i % 2 == 0 else "家族への誕生日", "自宅")
    return db


# U-69 D-02・D-04 I-47: 同点は選んだシーンの回数の多い順、次に商品ID順
def test_ties_follow_the_chosen_scene_count() -> None:
    for client in client_at(_fd11(), NOV15):
        order = {s: [i["product_id"] for i in client.get(f"/api/candidates?scene={s}").json()["items"]] for s in ("送別", "お礼", "誕生日")}
    assert order == {"送別": ["R3", "R1", "R2"], "お礼": ["R2", "R1", "R3"], "誕生日": ["R1", "R3", "R2"]}


# U-70: 10 位と 11 位が同点のとき、10 件目に入るのは選んだシーンの回数が多い方。上位 9 件の順は変わらない
def test_pool_boundary_uses_the_chosen_scene_count() -> None:
    items = [product(f"H{i}", "送別", 1, 3500, 4.0 + i * 0.01, 20) for i in range(1, 10)]
    items += [product("A", "送別", 1, 3500, 3.5, 20), product("B", "送別", 1, 3500, 3.5, 20)]
    db = CandidateDb(items)
    for pid in [i["id"] for i in items]:
        add_scenes(db, pid, "お礼", "誕生日")
    for _ in range(4):
        db.add_order("A", "ビジネスのお礼", "自宅")
        db.add_order("B", "友人への誕生日", "自宅")
    db.add_order("A", "家族への誕生日", "自宅")  # 誕生日: A=1、B=4。お礼: A=4、B=0
    for client in client_at(db, NOV15):
        thanks = [i["product_id"] for i in client.get("/api/candidates?scene=お礼").json()["items"]]
        bday = [i["product_id"] for i in client.get("/api/candidates?scene=誕生日").json()["items"]]
    assert thanks[:9] == bday[:9] == [f"H{i}" for i in range(9, 0, -1)]
    assert (thanks[9], bday[9]) == ("A", "B")


# I-41・I-46 D-34・SP-03: 候補の決め手の値。scene_count の n は理由の文の n と同じ。文の頭はシーンに合わせる。0 回は回数の文を出さない
def test_candidates_decision_values_and_reason_head() -> None:
    db = CandidateDb([product("P", "送別", 1, 3500, 4.6, 120, days=2, wrap=1), product("Q", "送別", 1, 3500, 3.0, 10, days=None, wrap=0)])
    for pid in ("P", "Q"):
        add_scenes(db, pid, "お礼", "誕生日")
    for _ in range(3):
        db.add_order("P", "ビジネスのお礼", "自宅")
    db.add_order("P", "友人への誕生日", "自宅")
    db.add_order("P", "家族への誕生日", "自宅")
    for client in client_at(db, NOV15):
        by = {s: {i["product_id"]: i for i in client.get(f"/api/candidates?scene={s}").json()["items"]} for s in ("お礼", "誕生日", "送別")}
    assert by["お礼"]["P"]["scene_count"] == {"scene": "お礼", "n": 3}
    assert by["お礼"]["P"]["reason"] == "お礼で3回選ばれていて、評価も4.6（120件）と高めです。2日で届き、ラッピングもできます。"
    assert by["誕生日"]["P"]["scene_count"] == {"scene": "誕生日", "n": 2}
    assert by["誕生日"]["P"]["reason"].startswith("誕生日で2回選ばれていて、")
    assert by["送別"]["P"]["scene_count"] == {"scene": "送別", "n": 0}  # 会社宛ての送別は無い
    assert by["送別"]["P"]["reason"] == "評価は4.6（120件）と高めです。2日で届き、ラッピングもできます。"  # 0 回は回数の文を出さない
    assert "職場の送別" not in by["お礼"]["P"]["reason"] and "職場の送別" not in by["誕生日"]["P"]["reason"]
    q = by["お礼"]["Q"]
    assert (q["delivery_days"], q["wrapping"], q["arrives_on"], q["scene_count"]) == (None, False, None, {"scene": "お礼", "n": 0})
    p = by["お礼"]["P"]
    assert (p["delivery_days"], p["wrapping"], p["arrives_on"]) == (2, True, "2026-11-17")


# I-42・I-43・I-45 D-28・D-29: 一覧は scene を付けたときだけ scene_count。詳細は任意の scene（空は無し・不正は 422）
def test_list_and_detail_scene_count() -> None:
    db = with_detail_columns(CandidateDb([product("P01", "送別", 1, 3500, 4.0, 10, days=3), product("Z01", "送別", 0, 3500, 4.0, 10, days=None)]))
    add_scenes(db, "P01", "お礼")
    for _ in range(2):
        db.add_order("P01", "ビジネスのお礼", "自宅")
    for client in client_at(db, NOV15):
        plain = client.get("/api/products").json()["items"]
        scened = client.get("/api/products?scene=お礼").json()["items"]
        d_none = client.get("/api/products/P01").json()
        d_empty = client.get("/api/products/P01?scene=").json()
        d_scene = client.get("/api/products/P01?scene=お礼").json()
        d_zero = client.get("/api/products/P01?scene=誕生日").json()
        bad = client.get("/api/products/P01?scene=誕生日会")
        out = client.get("/api/products/Z01?scene=お礼").json()
    assert [(i["scene_count"], i["arrives_on"]) for i in plain] == [(None, "2026-11-18")]
    assert [i["scene_count"] for i in scened] == [{"scene": "お礼", "n": 2}]
    assert d_none["scene_count"] is None and d_empty == d_none and d_none["arrives_on"] == "2026-11-18"
    assert d_scene["scene_count"] == {"scene": "お礼", "n": 2}  # 一覧と同じ値
    assert d_zero["scene_count"] == {"scene": "誕生日", "n": 0}
    assert bad.status_code == 422 and bad.json()["error"]["code"] == "invalid_scene"
    assert out["status"] == "out_of_stock" and out["arrives_on"] is None and out["scene_count"] == {"scene": "お礼", "n": 0}


# I-59 SP-26: どの API でも同じ商品の arrives_on は同じ。今日を替えると変わる。DB に問い合わせる数は増えない（D-34）
@pytest.mark.parametrize(("now", "want"), [(NOV15, "2026-11-17"), (datetime(2026, 11, 30, 3, 0, tzinfo=UTC), "2026-12-02"), (datetime(2026, 12, 31, 3, 0, tzinfo=UTC), "2027-01-02")])
def test_arrives_on_is_the_same_everywhere(now: datetime, want: str) -> None:
    db = with_detail_columns(CandidateDb([product("P01", "送別", 1, 3500, 4.0, 10, days=2), product("N01", "送別", 1, 3500, 3.9, 10, days=None)]))
    for client in client_at(db, now):
        cand = {i["product_id"]: i for i in client.get("/api/candidates?scene=送別").json()["items"]}
        lst = {i["product_id"]: i for i in client.get("/api/products").json()["items"]}
        det = client.get("/api/products/P01").json()
    assert cand["P01"]["arrives_on"] == lst["P01"]["arrives_on"] == det["arrives_on"] == want
    assert cand["N01"]["arrives_on"] is None and lst["N01"]["arrives_on"] is None


def test_query_counts_do_not_grow() -> None:
    """D-01 は今の 2 本（候補の抽出＋回数 1 回の集計）、D-28 は scene があるとき +1 本、D-29 は 1 本のまま（相関サブクエリ）"""
    db = with_detail_columns(CandidateDb([product("P01", "送別", 1, 3500, 4.0, 10)]))
    add_scenes(db, "P01", "お礼", "誕生日")
    for client in client_at(db, NOV15):
        for url, calls in (
            ("/api/candidates?scene=誕生日", 2), ("/api/products", 1), ("/api/products?scene=お礼", 2), ("/api/products/P01", 1), ("/api/products/P01?scene=送別", 1),
        ):  # fmt: skip
            before = db.calls
            assert client.get(url).status_code == 200
            assert db.calls - before == calls, url


def test_reason_without_count_can_be_empty_and_never_invented() -> None:
    assert build_reason(0, None, None, None, None, "お礼") == ""
    assert build_reason(0, None, 0, 2, False, "誕生日") == "2日で届きます。"


def test_scene_values_are_params_only(monkeypatch: Any) -> None:
    """N-04: 回数の SQL に入力の文字列が入らない（位置指定だけ）"""
    from decision import COUNT_HEAD, scene_params

    assert "%s" in COUNT_HEAD and all(w not in COUNT_HEAD for w in ("送別", "お礼", "誕生日", "会社"))
    assert scene_params("誕生日") == ("友人への誕生日", "家族への誕生日", 0, "会社")
    assert scene_params("送別") == ("送別", "送別", 1, "会社")
