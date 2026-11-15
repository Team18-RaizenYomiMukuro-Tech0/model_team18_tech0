# search_support.py — 言葉で探す（D-49）のテスト用: 架空の商品 7,766 件（search_corpus.py。本物の商品名ではない）と、I-62 の 28 語・当たりの条件。
# テストではないので pytest は拾わない。DB には繋がない（偽の DB。メモリ上の SQLite）。
from collections.abc import Callable
from typing import Any

from search_corpus import build
from test_products_filter import SpyDb, product

Row = dict[str, str]

SWEETS = {"焼き菓子", "クッキー", "フィナンシェ", "バウムクーヘン", "マカロン", "チョコレート", "ゼリー", "果肉入りのゼリー", "プリン", "どら焼き", "羊羹", "ドライフルーツ", "ラスク", "カステラ", "和菓子", "ケーキ"}
RELAX = {"入浴剤", "バスソルト", "アロマオイル", "ハーブティー", "ホットアイマスク", "キャンドル", "ルームフレグランス", "アロマディフューザー"}
GIVE_OUT = {"焼き菓子", "クッキー", "せんべい", "おかき", "ドリップコーヒー", "ラスク", "フィナンシェ"}
HEALTH = {"ハーブティー", "緑茶", "麦茶", "はちみつ", "玄米茶", "ほうじ茶"}
JAPANESE = {"和菓子", "羊羹", "どら焼き", "せんべい", "おかき", "緑茶", "抹茶", "ほうじ茶", "日本酒", "湯呑み"}
TEAS = {"紅茶", "緑茶", "玄米茶", "ほうじ茶", "麦茶", "抹茶", "ハーブティー"}

# (種類, 検索語, 当たりの条件)。I-62 の 28 語。条件は Terao の案（evidence/I-62.md に語ごとに書く。PM・Kurosu が直す）
QUERIES28: list[tuple[str, str, Callable[[Row], bool]]] = [
    ("商品名", "タオル", lambda r: "タオル" in r["base"]),
    ("商品名", "たおる", lambda r: "タオル" in r["base"]),
    ("商品名", "ｾﾞﾘｰ", lambda r: "ゼリー" in r["base"]),
    ("商品名", "紅茶 ギフト", lambda r: r["base"] == "紅茶"),
    ("商品名", "ワイン", lambda r: "ワイン" in r["base"]),
    ("商品名", "ハンドクリーム", lambda r: r["base"] == "ハンドクリーム"),
    ("商品名", "バスソルト", lambda r: r["base"] == "バスソルト"),
    ("商品名", "カタログギフト", lambda r: r["category"] == "カタログギフト"),
    ("商品名", "珈琲", lambda r: "コーヒー" in r["base"]),
    ("商品名", "ﾌﾗﾜｰ", lambda r: r["category"] == "フラワー" or "フラワー" in r["base"]),
    ("ふわっと", "甘いもの", lambda r: r["base"] in SWEETS),
    ("ふわっと", "お酒好き", lambda r: r["category"] == "酒類"),
    ("ふわっと", "疲れている人に", lambda r: r["base"] in RELAX),
    ("ふわっと", "職場に配れる", lambda r: r["base"] in GIVE_OUT),
    ("ふわっと", "お花を贈りたい", lambda r: r["category"] == "フラワー"),
    ("ふわっと", "健康志向", lambda r: r["base"] in HEALTH),
    ("ふわっと", "仕事で使える", lambda r: r["category"] == "ビジネス小物"),
    ("ふわっと", "コーヒー好き", lambda r: "コーヒー" in r["base"]),
    ("ふわっと", "和風のもの", lambda r: r["base"] in JAPANESE),
    ("ふわっと", "髪をいたわる", lambda r: r["base"] in {"ヘアオイル", "ドライヤー"}),
    ("ふわっと", "手土産に", lambda r: r["base"] in {"焼き菓子", "クッキー", "フィナンシェ", "バウムクーヘン", "マカロン", "ラスク", "カステラ", "和菓子", "ゼリー", "果肉入りのゼリー"}),
    ("ふわっと", "リラックスしたい", lambda r: r["base"] in RELAX),
    ("ふわっと", "ちょっとしたお礼", lambda r: r["base"] in {"焼き菓子", "クッキー", "ラスク", "フィナンシェ", "紅茶", "ドリップコーヒー", "ハンカチ"}),
    ("ふわっと", "おしゃれな贈り物", lambda r: r["base"] in {"フラワーアレンジメント", "プリザーブドフラワー", "キャンドル", "ルームフレグランス", "マグカップ", "ハンカチ", "シャンパン", "マカロン"}),
    ("ふわっと", "喉に優しい", lambda r: r["base"] in {"はちみつ", "ハーブティー", "ほうじ茶", "麦茶"}),
    ("ふわっと", "お茶", lambda r: r["base"] in TEAS),
    ("ふわっと", "のみもの", lambda r: r["category"] == "飲料"),
    ("ふわっと", "おやつ", lambda r: r["base"] in {"クッキー", "焼き菓子", "せんべい", "おかき", "ラスク", "プリン", "ゼリー", "果肉入りのゼリー", "どら焼き", "チョコレート", "マカロン"}),
]


class SearchDb(SpyDb):
    """架空の 7,766 件を持つ偽の DB。product_id は S00000〜。シーンは 3 つを順に割り当てる（AND の確かめ用）"""

    def __init__(self, n: int = 7766) -> None:
        self.meta: dict[str, Row] = {}
        rows = build(n)
        scenes = ("送別", "お礼", "誕生日")
        products = [product(r["product_id"], scenes[i % 3], 1, 1000 + (i % 40) * 100, 3.0 + (i % 20) * 0.1, 10 + i % 50, category=r["category"]) for i, r in enumerate(rows)]
        super().__init__(products)
        for r in rows:
            self.raw.execute("UPDATE products SET product_name = ? WHERE product_id = ?", (r["name"], r["product_id"]))
            self.meta[r["product_id"]] = r


def judge(db: SearchDb, items: list[dict[str, Any]], ok: Callable[[Row], bool]) -> list[bool]:
    return [ok(db.meta[i["product_id"]]) for i in items]
