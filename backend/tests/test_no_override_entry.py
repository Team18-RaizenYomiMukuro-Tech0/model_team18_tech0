# 完了条件 #6（E-14、設計.md「入口を作らないことの確認」）: 本番に時刻・遅れを変える入口が無い
import re
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import db as dbmod
import main
from clock import Clock, get_clock

BACKEND = Path(__file__).resolve().parent.parent


class FixedClock(Clock):
    def now(self) -> datetime:
        return datetime(2000, 1, 1, tzinfo=UTC)


def test_production_app_has_no_overrides_and_real_clock(monkeypatch: pytest.MonkeyPatch) -> None:
    assert main.app.dependency_overrides == {}  # 本番の起動の設定には差し替えが登録されない
    monkeypatch.setenv("GIFTIA_NOW", "2000-01-01T00:00:00Z")
    monkeypatch.setenv("NOW", "2000-01-01T00:00:00Z")
    monkeypatch.setenv("DB_DELAY_SECONDS", "11")
    now = get_clock().now()
    assert abs(now - datetime.now(UTC)) < timedelta(seconds=5)
    assert now.tzinfo is not None and now.utcoffset() == timedelta(0)  # UTC
    assert dbmod.DB_TIMEOUT_SECONDS == 10


def test_query_and_header_cannot_change_time_or_delay() -> None:
    class RecordingDb(dbmod.Db):
        def __init__(self) -> None:
            super().__init__(lambda: None)
            self.sqls: list[str] = []

        def fetch_all(self, sql: str, params: tuple[object, ...] = ()) -> list[dict[str, object]]:
            self.sqls.append(sql)
            return [{"db": "giftia_t501", "tables": 7}]

    rec = RecordingDb()
    main.app.dependency_overrides[dbmod.get_db] = lambda: rec  # テストのコードの中だけで使う
    try:
        client = TestClient(main.app)
        r = client.get("/api/health?now=2000-01-01&delay=11&clock=1",
                       headers={"X-Now": "2000-01-01", "X-Delay": "11", "X-Clock-Override": "1"})
        assert r.status_code == 200 and len(rec.sqls) == 1
    finally:
        main.app.dependency_overrides.clear()
    assert main.app.dependency_overrides == {}
    assert get_clock().now().year >= 2026


def test_dependency_overrides_only_in_tests() -> None:
    """dependency_overrides は tests/ の中だけで使われている（本番のコードに無い）"""
    def code_of(p: Path) -> str:  # コメントは除き、コードの行だけ見る
        return "\n".join(re.sub(r"#.*$", "", line) for line in p.read_text(encoding="utf-8").splitlines())

    prod = [p.name for p in BACKEND.glob("*.py") if "dependency_overrides" in code_of(p)]
    assert prod == []


def test_production_code_does_not_import_test_doubles() -> None:
    for p in BACKEND.glob("*.py"):
        t = p.read_text(encoding="utf-8")
        assert not re.search(r"^\s*(from|import)\s+tests?\b", t, re.MULTILINE), p.name
        assert not re.search(r"os\.environ[^\n]*(NOW|DELAY|CLOCK)", t), p.name
