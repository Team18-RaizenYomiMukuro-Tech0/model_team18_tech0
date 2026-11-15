# 共有リンクの取得（D-06）の items[] に category を足す（#295 案 A。画面がカテゴリー共通のイラストを選ぶ）。
# 開いた時点の商品テーブルから取る（作成時点の保存値ではない）。商品が DB に無い（販売終了）ときは入れない。読み取りだけ。
from collections.abc import Iterator

import pytest
from test_share_create import Backend, create, make_fake
from test_share_get import _serve, fake_db, get


@pytest.fixture
def fake() -> Iterator[Backend]:
    yield from _serve(make_fake())


# SP-06 D-06 #295
def test_category(fake: Backend) -> None:
    db = fake_db(fake)
    link = create(["P01", "P02", "P09"])["share_id"]
    stored = {r[0]: r[1] for r in db.raw.execute("SELECT product_id, category FROM products WHERE product_id IN ('P01','P02','P09')")}
    got = {i["product_id"]: i for i in get(link).json()["items"]}
    assert all(got[p]["category"] == stored[p] for p in ("P01", "P02", "P09"))  # 商品テーブルのカテゴリーがそのまま入る
    # 開いた時点の値（保存はしない）: カテゴリーを変えると、次に開いたとき変わっている
    db.raw.execute("UPDATE products SET category = '食品' WHERE product_id = 'P01'")
    assert {i["product_id"]: i["category"] for i in get(link).json()["items"]}["P01"] == "食品"
    # 在庫なしでも商品が DB にあれば入る。販売終了（DB に無い）と、カテゴリーが空の商品は入れない
    db.raw.execute("UPDATE products SET stock = 0 WHERE product_id = 'P09'")
    db.raw.execute("DELETE FROM products WHERE product_id = 'P02'")
    db.raw.execute("UPDATE products SET category = NULL WHERE product_id = 'P01'")
    got = {i["product_id"]: i for i in get(link).json()["items"]}
    assert got["P09"]["status"] == "out_of_stock" and got["P09"]["category"] == stored["P09"]
    assert got["P02"]["status"] == "discontinued" and "category" not in got["P02"]
    assert "category" not in got["P01"]
    # 問い合わせは追加しない（在庫の確認と同じ 1 本）。書き込みは無い
    assert db.writes == [db.writes[0]]  # 作成の INSERT だけ


# SP-06 D-06 #295: 期限切れは商品を返さないので category も無い
def test_expired_has_no_category(fake: Backend) -> None:
    from datetime import timedelta

    from test_share_get import H720, SECOND, set_clock

    link = create(["P01"])["share_id"]
    set_clock(H720 + SECOND)
    r = get(link)
    assert r.status_code == 410 and "category" not in r.text
    set_clock(timedelta(0))
