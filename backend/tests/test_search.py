# Issue #361（Q1）: GET /api/products?q=（言葉で探す。設計 D-49、仕様 SP-35）。テスト設計 U-89・I-61・I-62。
# DB には繋がない。架空の商品 7,766 件（search_support.py）を持つ偽の DB（メモリ上の SQLite）に、本物と同じ SQL を流す。
# 本物の商品名での当たりは、実装後に人が本番（noindex）で確かめる（S-122）。ここは仕組みの確かめ。
import logging
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from search_support import QUERIES28, SearchDb, judge

import main
import search
from config import SETTINGS
from db import get_db


@pytest.fixture(scope="module")
def db() -> SearchDb:
    return SearchDb()


@pytest.fixture
def client(db: SearchDb) -> Iterator[TestClient]:
    main.app.dependency_overrides[get_db] = lambda: db
    try:
        yield TestClient(main.app)
    finally:
        main.app.dependency_overrides.clear()


def get(client: TestClient, query: str) -> Any:
    r = client.get(f"/api/products?{query}")
    return r


# --- U-89 D-49 言葉の正規化・言い換え表・近さの点の部品 ---
def test_normalize() -> None:
    # 全角と半角・ひらがなとカタカナ・大文字と小文字・前後の空白は同じになる
    assert search.normalize("ｾﾞﾘｰ") == search.normalize("ゼリー") == search.normalize("ぜりー")
    assert search.normalize("ＡＢＣ　") == search.normalize("abc") == search.normalize("ABC ")
    assert search.normalize("  タオル  ") == search.normalize("たおる")


def test_parse_q() -> None:
    assert search.parse_q(None) is None and search.parse_q("") is None and search.parse_q("   ") is None and search.parse_q("　 　") is None
    assert search.parse_q("あ" * 50) == ["あ" * 50]
    assert search.parse_q("あ" * 51) == "too_long"
    assert search.parse_q("  " + "あ" * 50 + "  ") == ["あ" * 50]  # 前後の空白を除いてから数える
    assert search.parse_q("紅茶　ギフト 紅茶") == ["紅茶", "ぎふと"]  # 空白（全角も）で区切る。重なった言葉は 1 つ


def test_rephrase_table() -> None:
    assert "ぜりー" in search.expand("甘いもの") and "こーひー" in search.expand("珈琲")
    assert search.expand("お酒好き")[0] == "お酒好き" and "酒類" in search.expand("お酒好き")  # 元の言葉もそのまま探し、「お酒」を含むので酒類に広がる
    assert search.expand("きらきら") == ["きらきら"]  # 表に無い言葉は広がらない


def test_match_count_and_closeness() -> None:
    rows = [
        {"product_name": "紅茶 ギフト", "category": "飲料"},
        {"product_name": "紅茶 3個入り", "category": "飲料"},
        {"product_name": "ワイン ギフト", "category": "酒類"},
        {"product_name": "タオル", "category": "生活雑貨"},
    ]
    hits = search.match(["紅茶", "ぎふと"], rows)
    assert hits[0][0] == 2 and hits[1][0] == 1 and hits[2][0] == 1 and 3 not in hits  # 合う言葉が多いほど上。合わない商品は出ない
    assert hits[0][1] > hits[1][1]


# --- I-61 D-49 GET /api/products?q=（偽の DB。班の DB は使わない）---
def test_q_basic(client: TestClient, db: SearchDb) -> None:
    r = get(client, "q=ギフト")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] > 12 and body["count"] == 12 and body["page_size"] == 12 and set(body) == {"items", "count", "total", "page", "page_size"}
    assert all("ぎふと" in search.normalize(i["name"] + " " + i["category"]) for i in body["items"])
    assert "score" not in body["items"][0] and "match" not in body["items"][0]  # 合い方の点は応答に出さない
    # q が空・空白だけは言葉なし（q が無いのと同じ）
    base = get(client, "").json()
    assert get(client, "q=").json() == base and get(client, "q=%20%20").json() == base
    # 51 文字は 422 invalid_q、50 文字は通る
    r = get(client, "q=" + "あ" * 51)
    assert (r.status_code, r.json()["error"]["code"]) == (422, "invalid_q")
    assert get(client, "q=" + "あ" * 50).status_code == 200


def test_q_and_with_conditions(client: TestClient, db: SearchDb) -> None:
    # 条件は外れず AND。シーンを選んでいても R-02 の 12 件ずつ（10 件にならない）
    allq = get(client, "q=ギフト").json()["total"]
    with_scene = get(client, "q=ギフト&scene=お礼").json()
    assert 0 < with_scene["total"] < allq and with_scene["count"] == 12
    assert all(i["scene_count"] is not None for i in with_scene["items"])  # シーンを付けたので決め手の回数が付く（D-34）
    r = get(client, "q=ギフト&scene=お礼&price_band=3000to4999&category=飲料").json()
    assert all(i["category"] == "飲料" and 3000 <= i["price"] <= 4999 for i in r["items"]) and r["total"] > 0
    only_cond = get(client, "scene=お礼&price_band=3000to4999&category=飲料").json()["total"]
    assert r["total"] <= only_cond  # 言葉は条件の中の絞り込み


def test_q_order_by_match_count(client: TestClient, db: SearchDb) -> None:
    both = get(client, "q=紅茶 ギフト").json()
    items = both["items"]
    # 合う言葉が 2 つの商品が先、1 つだけの商品は後ろに出る（AND で切らない）
    counts = []
    for i in items:
        t = search.normalize(i["name"] + " " + i["category"])
        counts.append(("紅茶" in t) + ("ぎふと" in t))
    assert counts == sorted(counts, reverse=True) and counts[0] == 2
    total_one = get(client, "q=紅茶").json()["total"]
    assert both["total"] > total_one  # 一部だけ合う商品（ギフトだけ）も含む


def test_q_no_match_relax(client: TestClient, db: SearchDb) -> None:
    r = get(client, "q=zzzzqqqq&scene=お礼&price_band=3000to4999").json()
    assert r["items"] == [] and r["total"] == 0 and r["count"] == 0
    cond = get(client, "scene=お礼&price_band=3000to4999").json()["total"]
    assert r["relax"]["no_q"] == cond > 0  # 言葉をはずしたときの件数
    assert set(r["relax"]) == {"price_band", "category", "no_q"} and r["relax"]["category"] is None
    # q が無い 0 件には no_q を付けない（今までの応答のまま）
    r2 = get(client, "price_band=3000to4999&category=家電&scene=お礼&page=1").json()
    r3 = get(client, "scene=お礼&price_band=3000to4999&category=ビジネス小物").json()
    assert "no_q" not in r3.get("relax", {}) and "no_q" not in r2.get("relax", {})


def test_q_relax_keeps_q(client: TestClient, db: SearchDb) -> None:
    """D-44: 価格帯・カテゴリーをはずした数にも言葉を残す（言葉もほかの条件の 1 つ）"""
    r = get(client, "q=紅茶&price_band=under3000&category=家電").json()
    assert r["total"] == 0
    no_cat = get(client, "q=紅茶&price_band=under3000").json()["total"]
    no_price = get(client, "q=紅茶&category=家電").json()["total"]
    assert r["relax"]["category"] == no_cat and r["relax"]["price_band"] == no_price
    plain = get(client, "category=家電").json()["total"]
    assert plain > 0 and no_price < plain  # 言葉なしの数（家電すべて）とは違う
    # 言葉に合う商品が無いなら、はずしても 0
    z = get(client, "q=zzzzqqqq&price_band=under3000&category=家電").json()["relax"]
    assert z["price_band"] == 0 and z["category"] == 0


def test_q_sort_wins(client: TestClient, db: SearchDb) -> None:
    by_match = [i["product_id"] for i in get(client, "q=紅茶 ギフト").json()["items"]]
    prices = [i["price"] for i in get(client, "q=紅茶 ギフト&sort=price_asc").json()["items"]]
    assert prices == sorted(prices) and len(prices) == 12  # sort があれば sort が先（合い方の順ではない）
    assert by_match != [i["product_id"] for i in get(client, "q=紅茶 ギフト&sort=price_asc").json()["items"]]
    assert get(client, "q=紅茶&sort=bad").status_code == 422  # 検査の順は今までどおり


def test_q_is_text_not_sql(client: TestClient, db: SearchDb) -> None:
    seen: list[str] = []
    orig = db.fetch_all

    def spy(sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        seen.append(sql + repr(params))
        return orig(sql, params)

    db.fetch_all = spy  # type: ignore[method-assign]  # 呼び出しを数えるため、メソッドをテスト用の関数に差し替える
    writes: list[str] = []
    def spy_write(sql: str, params: tuple[Any, ...] = ()) -> None:
        writes.append(sql)

    db.write = spy_write  # type: ignore[method-assign]  # 書き込みを数えるため、メソッドをテスト用の関数に差し替える
    before = db.row_count()
    try:
        r = get(client, "q=' OR 1=1 --")
        assert r.status_code == 200 and r.json()["total"] == 0  # 文字として扱われ、全部が当たることはない
        r = get(client, "q=1'; DROP TABLE products;--")
        assert r.status_code == 200
    finally:
        db.fetch_all = orig  # type: ignore[method-assign]  # 差し替えたメソッドを元に戻すため
        del db.write
    assert db.row_count() == before  # DB は壊れない
    assert writes == []  # 書き込みなし（usage_events にも share_links にも書かない）
    assert not any("OR 1=1" in s or "DROP TABLE" in s for s in seen)  # 言葉は SQL にも params にも入らない（①の SQL は q を知らない）


def test_q_not_logged(client: TestClient, caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.DEBUG)
    word = "ひみつの言葉xyz"
    get(client, f"q={word}")
    get(client, f"q={'あ' * 51}")  # 422 のときも
    assert word not in caplog.text and "ひみつ" not in caplog.text and "あああ" not in caplog.text


# --- I-62 D-49 検索の当たりの測定（28 語。架空の商品。PM 11/15）---
def first_page_hits(client: TestClient, db: SearchDb, word: str, ok: Any) -> list[bool]:
    items = get(client, f"q={word}").json()["items"]
    return judge(db, items, ok)


def test_hit_rate_28_words(client: TestClient, db: SearchDb) -> None:
    """当たりの語 ＝ 1 ページ目（12 件）の 1 位が当たりで、当たりが 1 件以上。商品名の語は 10 語すべて、ふわっとの語は 18 語のうち 15 語以上"""
    hit: dict[str, list[bool]] = {}
    for _, word, ok in QUERIES28:
        hit[word] = first_page_hits(client, db, word, ok)
    passed = {w: bool(h) and h[0] and any(h) for w, h in hit.items()}
    names = [w for k, w, _ in QUERIES28 if k == "商品名"]
    vague = [w for k, w, _ in QUERIES28 if k == "ふわっと"]
    assert len(names) == 10 and len(vague) == 18
    assert all(passed[w] for w in names), [w for w in names if not passed[w]]
    assert sum(passed[w] for w in vague) >= 15, [w for w in vague if not passed[w]]
    # 参考: 今の表と下限では、28 語すべてが 1 位から当たり、1 ページ目の外れは「紅茶 ギフト」のように一部だけ合う商品だけ
    assert all(passed.values())


def test_no_char_only_noise(client: TestClient, db: SearchDb) -> None:
    """文字の近さだけの外れが出ない: 手土産に にハンドクリームは出ない（全件を見て 0 件）。下限は SETTINGS.SEARCH_MIN_SCORE（D-49 決定 17）"""
    rows = db.fetch_all("SELECT product_id, product_name, category FROM products")
    hits = search.match(search.parse_q("手土産に") or [], rows)
    bases = {db.meta[rows[i]["product_id"]]["base"] for i in hits}
    assert "ハンドクリーム" not in bases and bases  # 当たりはあるが、ハンドクリームは出ない
    for word in ("リラックスしたい", "喉に優しい", "のみもの", "おやつ"):
        h = search.match(search.parse_q(word) or [], rows)
        assert h  # 全部 0 件にはならない
    # 下限の値は 85。70 未満ではハンドクリームが出る・80 未満ではほかの外れが出る（根拠は D-49）
    assert SETTINGS.SEARCH_MIN_SCORE == 85


def test_reference_words_recorded(client: TestClient, db: SearchDb) -> None:
    """参考値（合否に入れない）: 表に無い 5 語を送って、当たり方を記録する（evidence/I-62.md）。落ちずに 200 が返ること"""
    for word in ("出張のお土産", "差し入れ", "内祝い", "健康的なもの", "夏に涼しいもの"):
        r = get(client, f"q={word}")
        assert r.status_code == 200 and r.json()["count"] <= 12
