# test_db_admin.py — scripts/db_admin.py の SQL が DB管理手順.md と一字一句同じか照合する（DB には接続しない）
import re
import sys
from pathlib import Path

import pytest

import database

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND / "scripts"))
import db_admin

GUIDE = BACKEND.parent / "02_プロジェクト" / "giftia-ui-renewal" / "DB管理手順.md"


def norm(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def all_sql() -> list[str]:
    out: list[str] = []
    for name in dir(db_admin):
        if not name.startswith("SQL_"):
            continue
        value = getattr(db_admin, name)
        out += value if isinstance(value, list) else [value]
    return out


def test_every_sql_is_in_the_guide() -> None:
    guide = norm(GUIDE.read_text(encoding="utf-8"))
    missing = [s for s in all_sql() if norm(s) not in guide]
    assert missing == [], f"手順書に無い SQL: {missing}"


def test_db_name_is_fixed_and_no_override() -> None:
    assert database.DB_NAME == "giftia_t501"
    source = (BACKEND / "scripts" / "db_admin.py").read_text(encoding="utf-8")
    assert "GIFTIA_DB_NAME" not in source


def test_unknown_step_is_refused() -> None:
    assert db_admin.main(["db_admin.py", "DROP"]) == 2
    assert db_admin.main(["db_admin.py"]) == 2


def test_report_masks_secrets(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GIFTIA_DB_HOST", "db.example.invalid")
    monkeypatch.setenv("GIFTIA_DB_USER", "someuser")
    monkeypatch.setenv("GIFTIA_DB_PASSWORD", "s3cretpw")
    rep = db_admin.Report("0")
    assert rep.scrub("someuser@db.example.invalid s3cretpw") == "<伏せ>@<伏せ> <伏せ>"


def test_marked_row_insert_is_the_only_marked_write() -> None:
    assert "Bt" in db_admin.STEPS
    assert db_admin.SQL_BT.rstrip(";").endswith("UTC_TIMESTAMP(), 1)")
    assert "'BBBBBBBBBBBBBBBBBBBBBB'" in db_admin.SQL_BT
    assert db_admin.SQL_B.rstrip(";").endswith("UTC_TIMESTAMP(), 0)")
