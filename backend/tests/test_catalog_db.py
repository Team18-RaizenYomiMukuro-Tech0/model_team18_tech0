# 商品と回数の入れ物（設計.md D-04・D-50）を班の DB で確かめる。テスト設計 I-75〜I-78。
# 読むのは SELECT だけ。書くのは I-77・I-78 の共有リンク（is_test＝1。N-10）だけ。backend/.env の接続情報が無い環境（CI など）では飛ばす。
import os
from collections.abc import Iterator
from typing import Any

import pytest
from catalog_support import LOADER_SQLS, TickClock
from dotenv import load_dotenv
from fastapi.testclient import TestClient

import main
from catalog import Catalog, get_catalog
from clock import get_clock
from db import Db, DbError, get_db
from ranking import candidate_pool, score_products, top_by_score_then_count

load_dotenv()
if os.environ.get("GIFTIA_BACKEND_ENV"):  # worktree には .env が無いので、別の場所の .env を指せる（値は表示しない。measure_cache.py と同じ）
    load_dotenv(os.environ["GIFTIA_BACKEND_ENV"])
HAS_ENV = all(os.environ.get(k) for k in ("GIFTIA_DB_HOST", "GIFTIA_DB_USER", "GIFTIA_DB_PASSWORD"))
pytestmark = pytest.mark.skipif(not HAS_ENV, reason=".env に接続情報が無いので飛ばす")

TTL = 1800


class CountingDb(Db):
    """SQL の本数を数える（テストでだけ差す。D-12）。裏の読み込みの複製と記録・旗を共有する。fail が真の間はすべての SELECT が、fail_loader が真の間は読み込みの SELECT だけが失敗する"""

    def __init__(self) -> None:
        super().__init__()
        self.log: list[str] = []
        self.flags = {"fail": False, "fail_loader": False}

    def fetch_all(self, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        self.log.append(sql)
        if self.flags["fail"] or (self.flags["fail_loader"] and sql in LOADER_SQLS):
            raise DbError("OperationalError")
        return super().fetch_all(sql, params)

    def loads(self) -> int:
        return sum(1 for s in self.log if s == LOADER_SQLS[0])

    def old_path_selects(self) -> int:
        return sum(1 for s in self.log if s not in LOADER_SQLS)


class Env:
    def __init__(self, db: CountingDb, cat: Catalog, clock: TickClock, client: TestClient) -> None:
        self.db, self.cat, self.clock, self.client = db, cat, clock, client

    def get(self, path: str) -> Any:
        r = self.client.get(path)
        assert r.status_code == 200, r.text
        return r.json()


@pytest.fixture
def env() -> Iterator[Env]:
    db, cat, clock = CountingDb(), Catalog(), TickClock()
    main.app.dependency_overrides[get_db] = lambda: db
    main.app.dependency_overrides[get_catalog] = lambda: cat
    main.app.dependency_overrides[get_clock] = lambda: clock
    try:
        yield Env(db, cat, clock, TestClient(main.app))
    finally:
        main.app.dependency_overrides.clear()


def _independent_ids(db: Db, scene: str, low: int, high: int, limit: int) -> list[str]:
    """手で書いた SELECT（点数の材料と、選んだシーンの回数）から別に作った順位（上位 limit 件。I-46・I-47 と同じ式）"""
    rows = db.fetch_all(
        "SELECT p.product_id, p.rating, p.review_count FROM products p WHERE p.stock >= 1 "
        "AND p.product_id IN (SELECT s.product_id FROM product_scenes s WHERE s.scene_tag = %s) "
        "AND p.price >= %s AND p.price <= %s",
        (scene, low, high),
    )
    from decimal import Decimal

    scores = score_products([(str(r["product_id"]), None if r["rating"] is None else Decimal(str(r["rating"])), r["review_count"]) for r in rows])
    pool = candidate_pool(scores, limit)
    marks = ", ".join(["%s"] * len(pool))
    counts = {
        str(r["product_id"]): int(r["n"])
        for r in db.fetch_all(
            "SELECT oi.product_id AS product_id, COUNT(*) AS n FROM order_items oi JOIN orders o ON o.order_id = oi.order_id "
            "WHERE o.estimated_scene = %s AND o.ship_to_type = %s AND oi.product_id IN (" + marks + ") GROUP BY oi.product_id",
            ("送別", "会社", *pool),
        )
    }
    return top_by_score_then_count(scores, counts, pool, limit)


def test_I75_empty_then_memory(env: Env) -> None:
    """I-75: 空の間の 1 回目は今の道（SELECT 2 本）で返り、裏で読み込み 3 本が始まる。読み込み後は 0 本。D-28 は scene があっても追加の SELECT が出ない。順位は別に作った順位と一致"""
    db = env.db
    rows_before = int(Db().fetch_all("SELECT COUNT(*) AS n FROM products")[0]["n"])
    cand = "/api/candidates?scene=送別&price_band=3000to4999"
    first = env.get(cand)  # ① 空の間
    assert db.old_path_selects() == 2
    env.cat.wait()
    assert db.loads() == 1 and env.cat.snapshot is not None
    mark = len(db.log)
    second = env.get(cand)  # 読み込み後の 2 回目
    assert db.log[mark:] == []
    assert second == first  # N-18
    for path in (  # ② ③
        "/api/candidates?scene=お礼",
        "/api/candidates?scene=誕生日",
        "/api/candidates?scene=送別",
        "/api/products?scene=送別",
        "/api/products?q=タオル",
        "/api/products?q=タオル&scene=送別&price_band=3000to4999",
    ):
        env.get(path)
        assert len(db.log) == mark, path  # メモリが当たれば SELECT は 0 本
    ranked = [i["product_id"] for i in first["items"]]  # ④
    assert ranked == _independent_ids(Db(), "送別", 3000, 4999, 12)[: len(ranked)] or first["total"] > 12
    assert int(Db().fetch_all("SELECT COUNT(*) AS n FROM products")[0]["n"]) == rows_before  # 読み取りのみ


def test_I76_stale_then_reload(env: Env) -> None:
    """I-76: 期限切れの後だけ DB が失敗しても、待たずに古い値で 200。直したあとは、裏の読み直しが終わった呼び出しから新しい値"""
    db = env.db
    path = "/api/candidates?scene=送別&price_band=3000to4999"
    env.get(path)
    env.cat.wait()
    old = env.cat.snapshot
    assert old is not None
    expected = env.get(path)
    env.clock.advance(TTL + 60)
    db.flags["fail"] = True
    mark = len(db.log)
    assert env.get(path) == expected  # ① 待たずに古い値
    env.cat.wait()
    assert env.cat.snapshot is old  # 読み直しの失敗は入れ物を変えない
    db.flags["fail"] = False
    assert env.get(path) == expected  # ② 次の呼び出しも古い値で返り、読み直しが始まる
    env.cat.wait()
    assert env.cat.snapshot is not old
    mark2 = len(db.log)
    assert env.get(path) == expected
    assert len(db.log) == mark2  # 読み直したあとは SELECT が 0 本
    assert db.loads() >= 3 and mark < mark2
    # ③ 別の台（空のまま）で、読み込みだけが失敗する DB 口: 今の道で返り、結果は今と同じ。入れ物は空のまま
    cat2 = Catalog()
    main.app.dependency_overrides[get_catalog] = lambda: cat2
    db.flags["fail_loader"] = True
    assert env.get(path) == expected
    cat2.wait()
    assert cat2.snapshot is None


@pytest.mark.parametrize("scene", ["送別"])
def test_I77_share_link_uses_memory_counts(env: Env, test_mark_on: None, scene: str) -> None:
    """I-77: 候補の scene_count と、共有リンクに保存された理由の回数と、詳細の scene_count.n が同じ。共有ページの status の確認は DB を引く"""
    env.get(f"/api/candidates?scene={scene}")
    env.cat.wait()
    cand = env.get(f"/api/candidates?scene={scene}")  # ① メモリから
    item = next(i for i in cand["items"] if i["scene_count"]["n"] >= 1)
    n = item["scene_count"]["n"]
    pid = item["product_id"]
    created = env.client.post("/api/share-links", json={"product_ids": [pid], "scene": scene})  # ② is_test＝1（test_mark_on）
    assert created.status_code == 201, created.text
    link = created.json()
    got = env.get(f"/api/share-links/{link['share_id']}")  # ③
    assert got["items"][0]["reason"] == item["reason"] and f"{n}回" in got["items"][0]["reason"]
    detail = env.get(f"/api/products/{pid}?scene={scene}")  # ④ 詳細は DB から数える
    assert detail["scene_count"]["n"] == n
    mark = len(env.db.log)
    env.get(f"/api/share-links/{link['share_id']}")
    assert len(env.db.log) > mark  # 共有ページの確認は DB を引く（メモリを通さない）


def test_I78_share_link_while_empty(env: Env, test_mark_on: None) -> None:
    """I-78: 空の間に作った共有リンクの理由の回数は、空の間の候補の scene_count と同じ（今の道で数えた値）。読み込み後の候補とも同じ"""
    first = env.get("/api/candidates?scene=送別")  # ① 空の間
    item = next(i for i in first["items"] if i["scene_count"]["n"] >= 1)
    assert env.db.loads() == 1  # 裏の読み込みは始まっている
    pid, n = item["product_id"], item["scene_count"]["n"]
    created = env.client.post("/api/share-links", json={"product_ids": [pid], "scene": "送別"})  # ② is_test＝1
    assert created.status_code == 201, created.text
    got = env.get(f"/api/share-links/{created.json()['share_id']}")
    assert f"{n}回" in got["items"][0]["reason"] and got["items"][0]["reason"] == item["reason"]
    env.cat.wait()
    again = env.get("/api/candidates?scene=送別")  # ③
    assert next(i for i in again["items"] if i["product_id"] == pid)["scene_count"]["n"] == n
