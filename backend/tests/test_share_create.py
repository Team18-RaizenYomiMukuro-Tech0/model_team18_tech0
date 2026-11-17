# 完了条件 #1〜#5・#7（共有リンクを作る API。仕様 SP-05・SP-07、設計 D-05・D-07、DATA-02）
# 偽の DB（メモリ上の SQLite。本物と同じ SQL を流す）が基本。test_create・test_timeout は班の DB でも流し、届かなければ skip する。
# テスト関数名は Issue の完了条件どおり（NF-32 の命名とは違うが、担当 matsuki の判断で Issue どおり。B4 #61 と同じ）。
import json
import re
import time
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from candidates_support import CandidateDb, fd1, fd1_counts
from fastapi.testclient import TestClient
from test_products_filter import FakeConn

import main
from clock import Clock, get_clock
from db import Db, get_db
from share_id import SHARE_ID_RE, new_share_id
from share_mark import get_test_mark

URL = "/api/share-links"
ALL = [f"P{i:02d}" for i in range(1, 14)]  # 固定データ FD-1 の商品 13 件


class FakeShareDb(CandidateDb):
    """FD-1 と、その送別回数に、共有リンクの表を足した偽の DB。流れた SQL を覚える"""

    def __init__(self) -> None:
        super().__init__(fd1(), fd1_counts())
        self.raw.execute("CREATE TABLE share_links (share_id TEXT PRIMARY KEY, items TEXT, created_at TEXT, is_test INTEGER)")
        self.raw.execute(  # 第2弾のいいねの表（設計 D-38。取得が LEFT JOIN するため）
            "CREATE TABLE share_likes (share_id TEXT, product_id TEXT, like_count INTEGER, updated_at TEXT, PRIMARY KEY (share_id, product_id))"
        )
        self.reads: list[str] = []
        self.writes: list[str] = []

    def fetch_all(self, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        self.reads.append(sql)
        return super().fetch_all(sql, params)

    def insert_share_link(self, sql: str, params: tuple[Any, ...]) -> None:
        self.writes.append(sql)
        super().insert_share_link(sql, params)


@dataclass
class Backend:
    """作成の API を試す場所（偽の DB か班の DB）"""

    name: str
    db: Db
    connect: Callable[[], Any]
    ids: list[str]  # 存在する商品 ID（3 件以上）

    def count(self) -> int:
        return int(self.db.fetch_all("SELECT COUNT(*) AS n FROM share_links")[0]["n"])

    def row(self, share_id: str) -> dict[str, Any]:
        rows = self.db.fetch_all(
            "SELECT share_id, items, created_at, is_test FROM share_links WHERE share_id = %s", (share_id,)
        )
        assert len(rows) == 1
        return rows[0]


def items_of(row: dict[str, Any]) -> list[dict[str, Any]]:
    value = row["items"]
    parsed = json.loads(value) if isinstance(value, str | bytes) else value
    assert isinstance(parsed, list)
    return parsed


def make_fake() -> Backend:
    db = FakeShareDb()
    return Backend("fake", db, lambda: FakeConn(db.raw), ["P01", "P02", "P09"])


def make_real() -> Backend:
    db = Db()
    try:
        n = db.fetch_all("SELECT COUNT(*) AS n FROM share_links")
        ids = [str(r["product_id"]) for r in db.fetch_all("SELECT product_id FROM products ORDER BY product_id LIMIT 3")]
    except Exception as ex:  # noqa: BLE001  届かない・.env が無い・表が無いときは skip する
        pytest.skip(f"班の DB に届かないため skip: {type(ex).__name__}")
    assert n is not None and len(ids) == 3
    from database import get_connection

    return Backend("real", db, get_connection, ids)


@pytest.fixture
def fake() -> Iterator[Backend]:
    yield from _serve(make_fake())


@pytest.fixture(params=["fake", "real"])
def backend(request: pytest.FixtureRequest) -> Iterator[Backend]:
    yield from _serve(make_fake() if request.param == "fake" else make_real(), mark=1)


def _serve(b: Backend, mark: int = 1) -> Iterator[Backend]:
    """テストのコードの中だけで、Db と印（is_test）を差し替える（D-12・D-19）"""
    app = main.app
    app.dependency_overrides[get_db] = lambda: b.db
    app.dependency_overrides[get_test_mark] = lambda: mark
    try:
        yield b
    finally:
        app.dependency_overrides.clear()


def post(body: Any) -> Any:
    return TestClient(main.app, raise_server_exceptions=False).post(URL, json=body)


def create(ids: list[str]) -> dict[str, Any]:
    r = post({"product_ids": ids})
    assert r.status_code == 201, r.text
    body: dict[str, Any] = r.json()
    return body


# SP-05 N-02 D-05 D-07 U-17 I-17
def test_share_id(fake: Backend) -> None:
    ids = [new_share_id() for _ in range(100)]
    assert len(set(ids)) == 100
    assert all(len(i) == 22 and SHARE_ID_RE.match(i) for i in ids)
    assert ids != sorted(ids) and ids != sorted(ids, reverse=True)  # 作成順・連番ではない
    a, b = create(fake.ids[:2])["share_id"], create(fake.ids[:2])["share_id"]
    assert a != b and SHARE_ID_RE.match(a) and SHARE_ID_RE.match(b)


# SP-05 SP-07 D-05 DATA-02 I-06 I-15 I-16 I-29
def test_create(backend: Backend) -> None:
    ids = backend.ids
    before = backend.count()
    body = create(ids)
    assert set(body) == {"share_id", "path", "created_at", "expires_at"}
    sid = body["share_id"]
    assert body["path"] == f"/s/{sid}" and SHARE_ID_RE.match(sid)
    fmt = "%Y-%m-%dT%H:%M:%SZ"
    made = datetime.strptime(body["created_at"], fmt)
    assert datetime.strptime(body["expires_at"], fmt) - made == timedelta(hours=720)
    assert backend.count() == before + 1
    row = backend.row(sid)
    assert row["is_test"] == 1
    saved = items_of(row)
    assert [i["product_id"] for i in saved] == ids  # 選んだ順
    for i in saved:
        assert set(i) == {"product_id", "name", "price", "reason"}
        found = backend.db.fetch_all(
            "SELECT product_name, price FROM products WHERE product_id = %s", (i["product_id"],)
        )[0]
        assert (i["name"], i["price"]) == (found["product_name"], found["price"])
        # scene を付けない作成は、シーンに触れない文（回数の文なし）。材料が全部無ければ空（D-03。PM 11/17「1A」。U-90）
        assert i["reason"] == "" or i["reason"].endswith("。")
        assert "選ばれ" not in i["reason"] and "職場の送別" not in i["reason"]
    if backend.name == "fake":  # FD-1 の P09
        reason = {i["product_id"]: i["reason"] for i in saved}["P09"]
        assert reason == "評価は4.6（120件）と高めです。2日で届き、ラッピングもできます。"

    # I-15: 選び直すと別の識別子の新しい行。古い行はそのまま
    again = create([ids[2], ids[0]])["share_id"]
    assert again != sid and backend.count() == before + 2
    assert backend.row(sid) == row
    # I-16: 同じ選び方でも毎回別の行
    same = create(ids)["share_id"]
    assert same not in (sid, again) and backend.count() == before + 3
    assert items_of(backend.row(same)) == saved

    # I-29: L1 の作成日時を 100 時間前にして L2 を作っても L1 は L1 のまま
    class Fixed(Clock):
        def __init__(self, at: datetime) -> None:
            self.at = at

        def now(self) -> datetime:
            return self.at

    now = datetime.now(UTC).replace(microsecond=0)
    main.app.dependency_overrides[get_clock] = lambda: Fixed(now - timedelta(hours=100))
    l1 = create(ids)["share_id"]
    main.app.dependency_overrides[get_clock] = lambda: Fixed(now)
    l1_row = backend.row(l1)
    l2 = create(ids)["share_id"]
    assert l1 != l2 and backend.row(l1) == l1_row
    assert str(l1_row["created_at"]) == (now - timedelta(hours=100)).strftime("%Y-%m-%d %H:%M:%S")
    assert backend.count() == before + 5


# SP-05 N-06 D-05 I-07 I-08 I-25 I-26 U-33 NF-13
def test_count(fake: Backend) -> None:
    def rows() -> int:
        return fake.count()

    r = post({"product_ids": []})
    assert (r.status_code, r.json()["error"]["code"]) == (422, "empty_selection") and rows() == 0
    r = post({"product_ids": ALL[:11]})
    assert (r.status_code, r.json()["error"]["code"]) == (422, "too_many_items") and rows() == 0
    assert len(items_of(fake.row(create(ALL[:1])["share_id"]))) == 1
    assert len(items_of(fake.row(create(ALL[:10])["share_id"]))) == 10
    assert rows() == 2
    # 重複込み 11 個・重複を除くと 10 件は作られる。重複を除いても 11 件は 422
    assert len(items_of(fake.row(create([*ALL[:10], ALL[0]])["share_id"]))) == 10
    assert post({"product_ids": [*ALL[:11], ALL[0]]}).json()["error"]["code"] == "too_many_items"
    assert rows() == 3
    # [A,B,A,C] は [A,B,C]（最初の出現順）。[A,A] は 1 件
    a, b, c = ALL[:3]
    assert [i["product_id"] for i in items_of(fake.row(create([a, b, a, c])["share_id"]))] == [a, b, c]
    assert len(items_of(fake.row(create([a, a])["share_id"]))) == 1
    # 配列の長さ 50 は受け付け、51 は（重複を除くと 1 件でも・存在しない ID を含んでも）too_many_items
    assert len(items_of(fake.row(create([a] * 50)["share_id"]))) == 1
    assert create([*ALL[:10], *ALL[:10], *ALL[:10], *ALL[:10], *ALL[:10]])["share_id"]
    for ids in ([a] * 51, [*(["ZZZ"] * 50), a]):
        r = post({"product_ids": ids})
        assert (r.status_code, r.json()["error"]["code"]) == (422, "too_many_items")
    assert rows() == 7  # 3 件 + [A,B,A,C]・[A,A]・長さ 50 の 2 通り（各 1 行）
    # 選んだ順 [C,A,B] のまま保存される（取得 B6 の並びの元）
    assert [i["product_id"] for i in items_of(fake.row(create([c, a, b])["share_id"]))] == [c, a, b]


# SP-03 SP-05 D-05 第2弾「シーンに合わせる」（PM 11/15 朝）: scene は任意。不正は 422 invalid_scene。
# 無い・空は、送別ではなくシーンに触れない文（D-03。PM 11/17「1A」。I-14 ④）
def test_scene(fake: Backend) -> None:
    db: Any = fake.db
    for _ in range(3):
        db.add_order("P01", "ビジネスのお礼", "個人")  # お礼は宛先を問わない（D-34）
    db.add_order("P01", "友人への誕生日", "個人")
    db.add_order("P01", "家族への誕生日", "個人")

    def reason(body: dict[str, Any]) -> str:
        r = post({"product_ids": ["P01"], **body})
        assert r.status_code == 201, r.text
        return str(items_of(fake.row(r.json()["share_id"]))[0]["reason"])

    tail = "評価も4.5（20件）と高めです。2日で届き、ラッピングもできます。"
    assert reason({"scene": "送別"}) == "職場の送別で12回選ばれていて、" + tail
    no_scene = "評価は4.5（20件）と高めです。2日で届き、ラッピングもできます。"
    assert reason({}) == reason({"scene": ""}) == reason({"scene": None}) == no_scene
    assert "選ばれ" not in no_scene and "送別" not in no_scene
    assert reason({"scene": "お礼"}) == "お礼で3回選ばれていて、" + tail
    assert reason({"scene": "誕生日"}) == "誕生日で2回選ばれていて、" + tail
    # 回数 0 は回数の文を出さず、評価の文から始める
    r = post({"product_ids": ["P02"], "scene": "お礼"})
    text = str(items_of(fake.row(r.json()["share_id"]))[0]["reason"])
    assert text.startswith("評価は") and "回選ばれて" not in text and "まだありません" not in text
    before = fake.count()
    for bad in ("結婚", "送別 ", 1, True, ["送別"]):
        r = post({"product_ids": ["P01"], "scene": bad})
        assert (r.status_code, r.json()["error"]["code"]) == (422, "invalid_scene"), bad
    assert fake.count() == before  # 不正な scene では 1 行も作らない


# SP-05 N-04 I-21 NF-07
def test_invalid(fake: Backend) -> None:
    cases: list[Any] = [
        {"product_ids": ["ZZZ"]},  # 存在しない商品 ID
        {"product_ids": [ALL[0], "ZZZ"]},
        {"product_ids": [1]},  # 型が不正（数値・小数・真偽値・null・入れ子）
        {"product_ids": [1.5]},
        {"product_ids": [True]},
        {"product_ids": [None]},
        {"product_ids": [["P01"]]},
        {"product_ids": [1, "x'"]},
        {"product_ids": "P01"},
        {"product_ids": None},
        {},  # product_ids が無い
        ["P01"],
        {"product_ids": ["1 OR 1=1"]},
        {"product_ids": ["1'; DROP TABLE share_links;--"]},
    ]
    for body in cases:
        r = post(body)
        assert (r.status_code, r.json()["error"]["code"]) == (422, "invalid_product_ids"), body
    r = TestClient(main.app, raise_server_exceptions=False).post(URL, content=b"{not json")
    assert (r.status_code, r.json()["error"]["code"]) == (422, "invalid_product_ids")
    assert fake.count() == 0
    assert fake.db.writes == []  # type: ignore[attr-defined]


# SP-05 D-05 D-15 I-18 I-19 E-13
def test_timeout(backend: Backend) -> None:
    def slow() -> Any:
        time.sleep(11)
        return backend.connect()

    before = backend.count()
    main.app.dependency_overrides[get_db] = lambda: Db(connect=slow)
    started = time.monotonic()
    r = post({"product_ids": backend.ids})
    elapsed = time.monotonic() - started
    assert r.status_code == 500 and r.json()["error"]["code"] == "internal_error"
    assert 9.5 <= elapsed < 11, elapsed  # 約 10 秒で打ち切る
    time.sleep(1.5)  # 遅れて動いた分が済むのを待つ。打ち切り後に裏で行が作られても許すが、増えた分は後片付けする
    after = backend.count()
    print(f"[{backend.name}] share_links 件数 前={before} 後={after}（後片付けは手順書のとおり、配られたアカウントで）")


# SP-05 N-04 D-12 N-09 #70-2
def test_write_scope(fake: Backend) -> None:
    create(fake.ids)
    post({"product_ids": ["ZZZ"]})
    db: FakeShareDb = fake.db  # type: ignore[assignment]
    assert len(db.writes) == 1  # 書き込みは 1 回だけ
    sql = db.writes[0]
    assert re.match(r"^INSERT INTO share_links \(", sql)
    assert not re.search(r"\b(UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|REPLACE)\b", sql, re.IGNORECASE)
    assert "'" not in sql and '"' not in sql and "%s" in sql  # 値はすべて %s と params
    assert db.reads and all(re.match(r"^\s*SELECT\b", s, re.IGNORECASE) for s in db.reads)
    assert not any(re.search(r"\b(users|share_links)\b", s) for s in db.reads)  # 読みは商品と注文だけ
