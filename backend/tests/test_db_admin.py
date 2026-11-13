# test_db_admin.py — scripts/db_admin.py の SQL が DB管理手順.md と一字一句同じか照合する（DB には接続しない）
import re
import subprocess
import sys
from pathlib import Path
from typing import Any, Self

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


class FakeCursor:
    def __init__(self) -> None:
        self.last = ""

    def __enter__(self) -> Self:
        return self

    def __exit__(self, *a: object) -> None:
        return None

    def execute(self, q: str) -> None:
        self.last = q

    def fetchall(self) -> list[dict[str, Any]]:
        if self.last.startswith("SHOW TABLES"):
            names = [*db_admin.EXISTING_TABLES, "share_links"]
            return [{"Tables_in_giftia_t501": n} for n in names]
        if "information_schema.columns" in self.last:
            names = [*db_admin.EXISTING_TABLES, "share_links"]
            return [{"TABLE_NAME": n, "COLUMN_NAME": "c"} for n in names]
        if "information_schema.tables" in self.last:
            return [{"TABLE_NAME": "orders", "TABLE_ROWS": "1"}]
        return [{"COUNT(*)": 5}]


class FakeConn:
    def cursor(self) -> FakeCursor:
        return FakeCursor()


def test_snapshot_excludes_share_links() -> None:
    snap = db_admin.snapshot(FakeConn(), db_admin.Report("C"))
    assert {c["TABLE_NAME"] for c in snap["columns"]} == set(db_admin.EXISTING_TABLES)
    assert set(snap["counts"]) == set(db_admin.EXISTING_TABLES)


def test_save_never_overwrites(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(db_admin, "EVIDENCE_DIR", tmp_path)
    first = db_admin.Report("C").save()
    second = db_admin.Report("C").save()
    assert first != second
    assert first.exists()
    assert second.exists()


def git(cwd: Path, *args: str) -> None:
    subprocess.run(
        ["git", "-c", "user.name=t", "-c", "user.email=t@example.invalid", *args],
        cwd=cwd,
        check=True,
        capture_output=True,
    )


def test_evidence_dir_is_main_folder_from_worktree(tmp_path: Path) -> None:
    """#219: 本体のフォルダからも git worktree の中からも、記録の保存先は本体のフォルダ（git-common-dir の親）"""
    main = tmp_path / "main"
    (main / "backend").mkdir(parents=True)
    git(main, "init", "-q")
    (main / "backend" / "x.txt").write_text("x", encoding="utf-8")
    git(main, "add", ".")
    git(main, "commit", "-q", "-m", "init")
    work = tmp_path / "work"
    git(main, "worktree", "add", "-q", str(work), "-b", "t")
    assert db_admin.main_root(main / "backend") == main.resolve()
    assert db_admin.main_root(work / "backend") == main.resolve()


def test_main_root_falls_back_without_git(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    def no_git(*a: object, **k: object) -> None:
        raise FileNotFoundError("git")

    monkeypatch.setattr(subprocess, "run", no_git)
    backend = tmp_path / "backend"
    backend.mkdir()
    assert db_admin.main_root(backend) == tmp_path


def test_evidence_dir_constant() -> None:
    assert db_admin.EVIDENCE_DIR == db_admin.main_root() / "02_プロジェクト" / "giftia-ui-renewal" / "evidence" / "db"


def test_main_prints_uncommitted_record_last(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """成功でも、止まったときでも、最後の行は「コミットしていない記録: <パス>」。DB には接続しない（偽の接続）"""

    class FakeConn:
        def close(self) -> None:
            return None

    def ok(conn: Any, rep: db_admin.Report) -> None:
        rep.say("確認")

    def stop(conn: Any, rep: db_admin.Report) -> None:
        raise SystemExit("止める理由")

    monkeypatch.setattr(db_admin, "EVIDENCE_DIR", tmp_path)
    monkeypatch.setattr(database, "get_connection", lambda: FakeConn())
    monkeypatch.setitem(db_admin.HANDLERS, "0", ok)
    assert db_admin.main(["db_admin.py", "0"]) == 0
    last = capsys.readouterr().out.strip().splitlines()[-1]
    assert last.startswith("コミットしていない記録: ") and last.endswith(".md")
    assert Path(last.split(": ", 1)[1]).parent == tmp_path
    monkeypatch.setitem(db_admin.HANDLERS, "0", stop)
    with pytest.raises(SystemExit):
        db_admin.main(["db_admin.py", "0"])
    assert capsys.readouterr().out.strip().splitlines()[-1].startswith("コミットしていない記録: ")
