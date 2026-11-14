# 完了条件 #4・#5（U-19・U-21・U-25、I-04・I-05・I-24・I-27・I-28、NF-05、設計.md D-01）: API に直接送って応答を確かめる。
# DB は使わない（偽の DB。SQL は本物と同じ文を流す）。
from typing import Any

from candidates_support import CandidateDb, client_for, fd1, fd1_counts, ids, product
from fastapi.testclient import TestClient

Params = list[tuple[str, str]]


def get(client: TestClient, params: Params) -> tuple[int, dict[str, Any]]:
    r = client.get("/api/candidates", params=params)
    return r.status_code, r.json()


def test_invalid() -> None:
    """U-21・I-04・NF-05: 不正な値は 422（500 にならない）。DB は呼ばない。DB の行数は変わらない"""
    cases: list[tuple[Params, str]] = [
        ([("scene", "送別"), ("price_band", "４５００")], "invalid_price_band"),
        ([("scene", "送別"), ("price_band", "4500")], "invalid_price_band"),  # 金額
        (
            [("scene", "送別"), ("price_band", "３０００to4999")],
            "invalid_price_band",
        ),  # 全角
        (
            [("scene", "送別"), ("price_band", "3000to4999 OR 1=1")],
            "invalid_price_band",
        ),
        ([("scene", "送別"), ("price_band", "3000to4999'")], "invalid_price_band"),
        ([("scene", "送別"), ("price_band", '"3000to4999"')], "invalid_price_band"),
        ([("scene", "送別"), ("price_band", " ")], "invalid_price_band"),
        ([("scene", "")], "invalid_scene"),
        ([], "invalid_scene"),  # scene を付けない
        ([("scene", "取引先")], "invalid_scene"),
        ([("scene", "送別' OR '1'='1")], "invalid_scene"),
        ([("scene", "送別"), ("category", "お菓子")], "invalid_category"),
        ([("scene", "送別"), ("category", "食品 ")], "invalid_category"),  # 後ろに空白
        ([("scene", "送別"), ("category", "ｼｮｸﾋﾝ")], "invalid_category"),  # 半角カナ
        (
            [("scene", "送別"), ("category", "食品"), ("category", "お菓子")],
            "invalid_category",
        ),  # 1 つでも混ざれば 422
    ]
    db = CandidateDb(fd1(), fd1_counts())
    for client in client_for(db):
        before = db.table_counts()
        for params, code in cases:
            status, body = get(client, params)
            assert status == 422, params
            assert body["error"]["code"] == code, params
            assert set(body["error"]) == {"code", "message"}
        assert db.calls == 0  # 不正な要求は DB を呼ばない
        assert db.table_counts() == before  # 読み取りのみ
        for ok in ("under3000", "3000to4999", "5000plus"):  # 3 つは受け付ける
            assert get(client, [("scene", "送別"), ("price_band", ok)])[0] == 200


def test_no_price_band() -> None:
    """U-34・U-22・I-27・I-28（完了条件 5）: price_band なし／空／budget 付きはどれも 200 で同じ結果。該当 0 件でも 200"""
    for client in client_for(CandidateDb(fd1(), fd1_counts())):
        base = get(client, [("scene", "送別")])
        assert (
            base[0] == 200
            and base[1]["count"] == 10
            and base[1]["items"][0]["product_id"] == "P13"
        )
        for extra in (
            [("price_band", "")],
            [("budget", "4500")],
            [("budget", "")],
            [("price_band", ""), ("budget", "4500")],
        ):
            assert get(client, [("scene", "送別"), *extra]) == base, extra
        assert get(client, [("scene", "お礼")]) == (200, {"items": [], "count": 0})


def test_category() -> None:
    """#55-1・#58-3・#59-2: 選んだカテゴリーのどれか（OR）に絞ってから順位。重なりは 1 つ。空は無視。10 個全部は付けないのと同じ"""
    items = [
        product("C1", "送別", 1, 3200, 4.0, 10, category="食品"),
        product("C2", "送別", 1, 4000, 4.2, 10, category="コスメ"),
        product("C3", "送別", 1, 5500, 4.4, 10, category="酒類"),
        product("C4", "誕生日", 1, 3500, 4.0, 10, category="食品"),
    ]
    allcat = [
        "生活雑貨",
        "食品",
        "コスメ",
        "飲料",
        "家電",
        "インテリア",
        "ビジネス小物",
        "フラワー",
        "酒類",
        "カタログギフト",
    ]
    for client in client_for(CandidateDb(items)):

        def q(*cats: str, client: TestClient = client) -> list[str]:
            r = client.get(
                "/api/candidates",
                params=[("scene", "送別"), *[("category", c) for c in cats]],
            )
            assert r.status_code == 200, r.text
            return [i["product_id"] for i in r.json()["items"]]

        assert q("食品") == ["C1"]  # 誕生日の C4 は出ない
        assert q("食品", "コスメ") == ["C2", "C1"]  # OR
        assert q("食品", "食品") == q("食品")  # 重なりは 1 つ
        assert q("") == q() == ["C3", "C2", "C1"]  # 空はカテゴリーなし
        assert q("食品", "") == ["C1"]  # 空を無視して食品だけ
        assert q(*allcat) == q()  # 10 個全部は付けないのと同じ
        assert q(" ", "　") == q()  # 空白だけ（全角も）


def test_item_fields_and_reason() -> None:
    """D-01: 項目は product_id・name・price・category・high_rating・reason。4.5 は true、4.49 は false。理由は 1 つの文字列"""
    for client in client_for(CandidateDb(fd1(), fd1_counts())):
        r = client.get("/api/candidates?scene=送別&price_band=3000to4999").json()
        assert r["count"] == 8
        by = {i["product_id"]: i for i in r["items"]}
        assert set(by["P01"]) == {
            "product_id",
            "name",
            "price",
            "category",
            "high_rating",
            "delivery_days",
            "wrapping",
            "arrives_on",
            "scene_count",
            "reason",
        }
        assert by["P01"]["high_rating"] is True and by["P02"]["high_rating"] is False
        assert by["P03"]["high_rating"] is False  # 評価なし
        assert (
            by["P09"]["reason"]
            == "職場の送別で48回選ばれていて、評価も4.6（120件）と高めです。2日で届き、ラッピングもできます。"
        )  # 仕様 SP-03 の例
        assert all(isinstance(i["reason"], str) and i["reason"] for i in r["items"])


def test_sendoff_count_from_orders() -> None:
    """I-05: 送別回数は『送別・会社宛て』の注文だけを商品ごとに数える。自宅宛て・gift_purpose だけが送別は数えない"""
    items = [
        product("X", "送別", 1, 3500, 4.0, 10),
        product("Y", "送別", 1, 3500, 4.0, 10),
    ]
    db = CandidateDb(items)
    for _ in range(3):
        db.add_order("X", "送別", "会社")
    db.add_order("X", "送別", "自宅")
    db.add_order(
        "X", "お礼", "会社", purpose="送別"
    )  # 推定シーンが送別以外で gift_purpose だけ送別
    db.add_order("Y", "送別", "会社")
    for client in client_for(db):
        r = client.get("/api/candidates?scene=送別").json()
        by = {i["product_id"]: i["reason"] for i in r["items"]}
        assert "3回" in by["X"] and "1回" in by["Y"]  # X は 3、Y は 1
        assert ids(client, "scene=送別") == ["X", "Y"]  # 同点は回数の多い X が上
