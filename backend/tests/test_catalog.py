# 商品と回数の入れ物（設計.md D-04・D-50、ADR-023。要件 N-03・N-14・N-18）。テスト設計 U-112〜U-116。
# DB は使わない。偽の DB（メモリ上の SQLite）に本物と同じ SQL を流し、読み込みの SELECT（3 本）と今の道の SELECT を区別して数える。
import dataclasses
from typing import Any

import pytest
from catalog_support import Rig, TickClock, make_rig, many_db

import catalog
from catalog import Catalog
from config import SETTINGS

TTL = 1800


def test_U112_ttl_setting_is_one_place() -> None:
    """U-112 ⑥の前提・N-14: 期限は config.py の 1 か所（1800 秒）"""
    assert SETTINGS.CATALOG_TTL_SECONDS == TTL


def test_U112_fresh_within_ttl_no_reload() -> None:
    """U-112 ①②: 読み込み済みなら読み込みは増えない。1799 秒後も増えない"""
    db, clock, cat = many_db(), TickClock(), Catalog(sync=True)
    assert cat.current(db, clock) is None  # 空の間（最初の呼び出し）。読み込みは裏で（ここでは同期で）1 回
    assert db.loader_selects() == 3 and db.loads() == 1
    snap = cat.current(db, clock)  # ① 読み込みが終わった状態
    assert snap is not None and db.loader_selects() == 3
    clock.advance(TTL - 1)  # ② 1799 秒後
    assert cat.current(db, clock) is snap and db.loader_selects() == 3


def test_U112_expired_returns_stale_and_reloads_in_background() -> None:
    """U-112 ③: 期限を過ぎた呼び出しは待たず古い値で返る。読み直し（3 本）が 1 回始まり、終わったあとの呼び出しから新しい値"""
    db, clock, cat = many_db(), TickClock(), Catalog(sync=True)
    cat.current(db, clock)
    old = cat.current(db, clock)
    assert old is not None
    clock.advance(TTL)
    assert cat.current(db, clock) is old and db.loads() == 1  # ちょうど 1800 秒は期限内
    clock.advance(1)  # 1800 秒を超えた
    mark = db.mark()
    assert cat.current(db, clock) is old  # 古い値で返る（結果に使うのは古い値）
    assert len(db.since(mark)) == 3 and db.loads() == 2  # 読み直しは 3 本・1 回
    new = cat.current(db, clock)
    assert new is not None and new is not old and new.loaded_at == clock.t  # 次の呼び出しから新しい値。期限は読み終わった時刻から数え直す
    assert db.loader_selects() == 6
    clock.advance(TTL - 1)
    assert cat.current(db, clock) is new and db.loads() == 2


def test_U112_failed_reload_keeps_stale_and_retries_next_time() -> None:
    """U-112 ④: 読み直しに失敗しても古い値で返り、入れ物は古い値のまま。次の呼び出しでまた読み直しが始まる"""
    db, clock, cat = many_db(), TickClock(), Catalog(sync=True)
    cat.current(db, clock)
    old = cat.current(db, clock)
    clock.advance(TTL + 1)
    db.fail.add(catalog.SQL_COUNTS)
    assert cat.current(db, clock) is old and db.loads() == 2
    assert cat.snapshot is old  # 途中の値（商品と回数だけ新しい）は入らない
    assert cat.current(db, clock) is old and db.loads() == 3  # 次の呼び出しでまた始まる
    db.fail.clear()
    assert cat.current(db, clock) is old and db.loads() == 4
    new = cat.current(db, clock)
    assert new is not None and new is not old and db.loads() == 4


def test_U112_overlapping_reload_runs_once(rig_async: Rig) -> None:
    """U-112 ⑤: 期限切れのとき同時に 2 つ呼んでも、読み直しは 1 回だけ。2 つとも古い値で返る"""
    db, cat, clock = rig_async.db, rig_async.catalog, rig_async.clock
    assert cat.current(db, clock) is None
    cat.wait()
    old = cat.snapshot
    assert old is not None and db.loads() == 1
    clock.advance(TTL + 1)
    db.gate.clear()  # 読み直しを止めておく
    a, b = cat.current(db, clock), cat.current(db, clock)
    assert a is old and b is old
    assert db.loads() == 2  # 1 回だけ始まった（重ねない）
    db.gate.set()
    cat.wait()
    assert cat.current(db, clock) is not old and db.loads() == 2


def test_U112_ttl_changes_in_one_place(monkeypatch: pytest.MonkeyPatch) -> None:
    """U-112 ⑥・N-14: 設定の 1 か所（CATALOG_TTL_SECONDS）だけ変えると、期限が変わる"""
    monkeypatch.setattr(catalog, "SETTINGS", dataclasses.replace(SETTINGS, CATALOG_TTL_SECONDS=60))
    db, clock, cat = many_db(), TickClock(), Catalog(sync=True)
    cat.current(db, clock)
    old = cat.current(db, clock)
    clock.advance(59)
    assert cat.current(db, clock) is old and db.loads() == 1
    clock.advance(2)
    assert cat.current(db, clock) is old and db.loads() == 2


PATHS = (
    "/api/candidates?scene=送別&price_band=3000to4999",
    "/api/candidates?scene=お礼",
    "/api/candidates?scene=誕生日&price_band=under3000&category=食品",
    "/api/candidates?scene=送別&sort=scene_count_desc",
    "/api/candidates?scene=送別&sort=scene_count_desc&page=2",
    "/api/candidates?scene=送別&sort=price_asc",
    "/api/candidates?scene=誕生日&page=2",
    "/api/candidates?scene=お礼&price_band=5000plus&category=家電&category=食品",
    "/api/products?scene=送別",
    "/api/products?scene=誕生日&price_band=3000to4999&sort=rating_desc",
    "/api/products?price_band=under3000",
    "/api/products?q=商品",
    "/api/products?q=商品&scene=お礼&page=2",
    "/api/products?q=存在しない言葉",
    "/api/products?scene=送別&price_band=5000plus&category=家電&category=食品&page=1",
    "/api/products",
)


def _dump(r: Any) -> Any:
    assert r.status_code == 200, r.text
    return r.json()


def test_U113_memory_path_equals_db_path() -> None:
    """U-113・N-18: メモリから作った結果と、今の SQL の経路で作った結果が一致する（items の順・total・count・scene_count・理由）"""
    db = many_db()
    for client_mem in make_rig(db, Catalog(sync=True)):
        client_mem.catalog.current(db, client_mem.clock)  # 読み込む
        assert client_mem.catalog.snapshot is not None
        mem = {p: _dump(client_mem.client.get(p)) for p in PATHS}
        assert db.old_path_selects() == 0  # メモリが当たった間は今の道の SELECT が 0 本
    for client_db in make_rig(db, Catalog(enabled=False)):
        direct = {p: _dump(client_db.client.get(p)) for p in PATHS}
    assert mem == direct
    # 回数の数え方は U-68 と同じ（送別＝会社宛て。お礼。誕生日＝友人＋家族。毎年決まった相手への贈答と、会社宛てでない送別は数えない）。
    # 期待値は many_db の作り方（商品番号 i から）で別に求める
    expected = {
        "送別": {f"S{i:02d}": i % 5 for i in range(2, 31)} | {"T01": 1, "T02": 3, "T03": 2},
        "お礼": {f"S{i:02d}": i % 4 for i in range(2, 31)},
        "誕生日": {f"S{i:02d}": 2 * (i % 3) for i in range(2, 31)},
    }
    for r in make_rig(db, Catalog(sync=True)):
        r.catalog.current(db, r.clock)
        for scene, per in expected.items():
            got = {}
            for page in (1, 2, 3):
                for item in r.get(f"/api/products?scene={scene}&page={page}")["items"]:
                    got[item["product_id"]] = item["scene_count"]["n"]
            assert got and all(per.get(pid, 0) == n for pid, n in got.items()), scene
    listed = {i["product_id"] for p in PATHS for i in mem[p]["items"]}
    assert "S01" not in listed  # 在庫 0 の商品はどこにも出ない


def test_U113_zero_hit_relax_equals_db_path() -> None:
    """U-113・D-44: 0 件の助け舟（relax）の件数も、メモリと今の道で一致する"""
    paths = (
        "/api/candidates?scene=お礼&price_band=under3000&category=家電",
        "/api/products?scene=送別&price_band=5000plus&category=コスメ&category=飲料",
        "/api/products?q=存在しない言葉&scene=送別&price_band=3000to4999&category=食品",
    )
    db = many_db()
    for r in make_rig(db, Catalog(sync=True)):
        r.catalog.current(db, r.clock)
        mem = {p: _dump(r.client.get(p)) for p in paths}
    for r in make_rig(db, Catalog(enabled=False)):
        direct = {p: _dump(r.client.get(p)) for p in paths}
    assert mem == direct
    assert any("relax" in b for b in mem.values())


def test_U114_empty_serves_old_path_and_loads_in_background(rig_async: Rig) -> None:
    """U-114: 空の間は今の道（候補は 2 本、絞り込みは scene があるとき +1 本＝2 本）で返り、読み込みを待たない。裏で 1 回読み込む。結果は読み込み後と同じ"""
    db, cat = rig_async.db, rig_async.catalog
    db.gate.clear()  # 裏の読み込みを止める。応答が読み込みを待つなら、ここで固まる
    cand = "/api/candidates?scene=送別&price_band=3000to4999"
    prod = "/api/products?scene=送別"
    first_cand = rig_async.get(cand)
    assert db.old_path_selects() == 2  # 今の道（SELECT 2 本）
    assert db.loads() == 1  # 裏の読み込みが 1 回始まった
    first_prod = rig_async.get(prod)
    assert db.old_path_selects() == 4 and db.loads() == 1  # D-28 は +1 本（scene があるとき）。読み込みは重ねない
    db.gate.set()
    cat.wait()
    assert cat.snapshot is not None
    mark = db.mark()
    assert rig_async.get(cand) == first_cand
    assert rig_async.get(prod) == first_prod
    assert db.since(mark) == []  # 読み込み後は SELECT が 0 本


def test_U115_overlapping_requests_all_use_old_path_one_load(rig_async: Rig) -> None:
    """U-115: 読み込みの途中で重なった要求 3 つはすべて今の道で返り、読み込みは 1 回だけ。読み込みが終わった後の 1 つは SELECT が 0 本"""
    db, cat = rig_async.db, rig_async.catalog
    db.gate.clear()
    path = "/api/candidates?scene=誕生日&price_band=3000to4999"
    bodies = [rig_async.get(path) for _ in range(3)]
    assert bodies[0] == bodies[1] == bodies[2]
    assert db.loads() == 1  # 重ねない
    assert db.old_path_selects() == 6  # 3 つとも今の道（2 本ずつ）
    db.gate.set()
    cat.wait()
    mark = db.mark()
    assert rig_async.get(path) == bodies[0]
    assert db.since(mark) == []


@pytest.mark.parametrize("failing", ["products", "scenes", "counts"])
def test_U116_failed_load_keeps_empty_and_old_path_answers(failing: str) -> None:
    """U-116: 読み込みの 3 本のどれかが失敗しても入れ物は空のまま（途中の値を入れない）。その要求は今の道で返る。次の空の要求がまた読み込みを始め、成功すると以後はメモリ"""
    sql = {"products": catalog.SQL_PRODUCTS, "scenes": catalog.SQL_SCENES, "counts": catalog.SQL_COUNTS}[failing]
    db = many_db()
    for base in make_rig(db, Catalog(enabled=False)):
        expected = base.get("/api/candidates?scene=送別")
    db.log.clear()
    for r in make_rig(db, Catalog(sync=True)):
        db.fail.add(sql)
        assert r.get("/api/candidates?scene=送別") == expected  # 今の道の結果
        assert r.catalog.snapshot is None and db.loads() == 1
        assert r.get("/api/candidates?scene=送別") == expected  # 次の空の要求がまた始める（失敗のまま）
        assert r.catalog.snapshot is None and db.loads() == 2
        db.fail.clear()  # 失敗を直す
        assert r.get("/api/candidates?scene=送別") == expected
        assert db.loads() == 3 and r.catalog.snapshot is not None
        mark = db.mark()
        assert r.get("/api/candidates?scene=送別") == expected
        assert db.since(mark) == []  # 以後はメモリ


def test_U116_old_path_also_fails_gives_500() -> None:
    """U-116: 今の道も失敗する版は 500（失敗しました。もう一度お試しください）"""
    db = many_db()
    db.fail.add(catalog.SQL_PRODUCTS)
    db.flags["old_path_fails"] = True
    for r in make_rig(db, Catalog(sync=True)):
        resp: Any = r.client.get("/api/candidates?scene=送別")
        assert resp.status_code == 500
        assert resp.json()["error"]["code"] == "internal_error"
        assert r.catalog.snapshot is None


def test_invalid_input_does_not_start_a_load(rig_async: Rig) -> None:
    """D-50: 入力の検証に落ちた要求は DB を呼ばず、読み込みも始めない"""
    r: Any = rig_async.client.get("/api/candidates?scene=取引先")
    assert r.status_code == 422
    assert rig_async.db.log == [] and rig_async.catalog.snapshot is None
