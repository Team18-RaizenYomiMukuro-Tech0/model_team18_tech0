# test_db_admin.py — scripts/db_admin.py の SQL が DB管理手順.md と一字一句同じか照合する（DB には接続しない）
import os
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
        def autocommit(self, value: bool) -> None:
            return None

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


# ---- 手順D（手順書 3b。#135 完了条件 #4）: 控えた share_id の行だけを消す。偽の接続で、DB には接続しない ----
ID_A, ID_B, ID_C = "A" * 22, "B" * 22, "C" * 22


class DeleteCursor:
    """share_links（share_id の集合）を持つ偽のカーソル。流された文と params を残す"""

    def __init__(self, conn: "DeleteConn") -> None:
        self.conn = conn
        self.rows: list[dict[str, Any]] = []
        self.rowcount = 0

    def __enter__(self) -> Self:
        return self

    def __exit__(self, *a: object) -> None:
        return None

    def execute(self, q: str, params: tuple[Any, ...] = ()) -> None:
        self.conn.log.append((q, params))
        table = self.conn.table
        if q.startswith("SELECT DATABASE()"):
            self.rows = [{"DATABASE()": database.DB_NAME}]
        elif q == "SELECT COUNT(*) FROM share_links;":
            self.rows = [{"COUNT(*)": len(table)}]
        elif q.startswith("SELECT COUNT(*) FROM share_links WHERE share_id IN"):
            self.rows = [{"COUNT(*)": sum(1 for i in params if i in table)}]
        elif q.startswith("SELECT share_id"):
            self.rows = [{"share_id": i, "created_at": "t", "is_test": table[i]} for i in params if i in table]
        elif q.startswith("DELETE FROM share_links WHERE share_id IN"):
            gone = [i for i in params if i in table]
            self.conn.delete(gone)
            self.rowcount = len(gone)
        elif q == "START TRANSACTION;":
            self.rows = []
        elif q == "DELETE FROM share_links WHERE is_test = 1;":
            gone = [i for i, t in table.items() if t == 1]
            self.conn.delete(gone)
            self.rowcount = len(gone)
        elif q == "SELECT ROW_COUNT();":
            self.rows = [{"ROW_COUNT()": self.rowcount}]
        elif q.startswith(("SELECT is_test, COUNT(*)", "SELECT COUNT(*) FROM share_links WHERE is_test")):
            self.rows = [{"is_test": 1, "COUNT(*)": sum(1 for t in table.values() if t == 1)}]
        elif q.startswith("SELECT share_id, created_at, LEFT("):
            self.rows = [{"share_id": i, "created_at": "t", "items_head": "x"} for i, t in table.items() if t == 1]
        else:
            raise AssertionError(f"想定外の文: {q}")

    def fetchall(self) -> list[dict[str, Any]]:
        return self.rows


class DeleteConn:
    def __init__(self) -> None:
        self.table: dict[str, int] = {ID_A: 0, ID_B: 0, "Z" * 22: 0, "Y" * 22: 1}  # 値は is_test
        self.log: list[tuple[str, tuple[Any, ...]]] = []
        self.backup: dict[str, int] | None = None  # トランザクション中の、消す前の表
        self.autocommit_on = True  # database.get_connection() の初期値（#258）
        self.committed = False
        self.rolled_back = False

    def autocommit(self, value: bool) -> None:
        self.autocommit_on = value

    def delete(self, ids: list[str]) -> None:
        """autocommit が入っていれば、実行した瞬間に確定。切ってあれば、commit まで確定しない"""
        if not self.autocommit_on and self.backup is None:
            self.backup = dict(self.table)
        for i in ids:
            self.table.pop(i, None)

    def cursor(self) -> DeleteCursor:
        return DeleteCursor(self)

    def commit(self) -> None:
        self.committed = True
        self.backup = None

    def rollback(self) -> None:
        self.rolled_back = True
        if self.backup is not None:
            self.table = self.backup
            self.backup = None


def run_d(monkeypatch: pytest.MonkeyPatch, conn: DeleteConn, *answers: str) -> db_admin.Report:
    it = iter(answers)
    monkeypatch.setattr("builtins.input", lambda _="": next(it))
    rep = db_admin.Report("D")
    db_admin.step_d(conn, rep)
    return rep


def test_step_d_in_menu_and_sql_shape() -> None:
    assert "D" in db_admin.STEPS and db_admin.HANDLERS["D"] is db_admin.step_d
    stmt = db_admin._in_clause(db_admin.SQL_D_DELETE, 3)
    assert stmt == "DELETE FROM share_links WHERE share_id IN (%s, %s, %s);"
    assert db_admin._in_clause(db_admin.SQL_D_DELETE, 1).endswith("IN (%s);")


def test_parse_share_ids() -> None:
    assert db_admin.parse_share_ids(f"{ID_A}, {ID_B}  {ID_A}\n") == [ID_A, ID_B]  # 重複は 1 つ
    for bad in ("", "  ", "short", "A" * 21, "A" * 23, "A" * 21 + "!", f"{ID_A} x"):
        with pytest.raises(SystemExit):
            db_admin.parse_share_ids(bad)


def test_step_d_deletes_only_given_ids(monkeypatch: pytest.MonkeyPatch) -> None:
    conn = DeleteConn()
    rep = run_d(monkeypatch, conn, f"{ID_A} {ID_B}", "yes")
    assert conn.committed and set(conn.table) == {"Z" * 22, "Y" * 22}  # 入力した ID 以外は残る
    delete = [(q, p) for q, p in conn.log if q.startswith("DELETE")]
    assert delete == [("DELETE FROM share_links WHERE share_id IN (%s, %s);", (ID_A, ID_B))]
    text = "\n".join(rep.lines)
    assert "消す前の全体件数 4、該当件数 2" in text
    assert "消した後の全体件数 2（前 4）、該当件数 0（前 2）" in text
    assert "不合格" not in text


def test_step_d_stops_without_yes(monkeypatch: pytest.MonkeyPatch) -> None:
    conn = DeleteConn()
    with pytest.raises(SystemExit):
        run_d(monkeypatch, conn, ID_A, "no")
    assert not any(q.startswith("DELETE") for q, _ in conn.log) and len(conn.table) == 4


def test_step_d_stops_when_an_id_is_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    conn = DeleteConn()
    with pytest.raises(SystemExit):
        run_d(monkeypatch, conn, f"{ID_A} {ID_C}", "yes")  # ID_C は表に無い
    assert not any(q.startswith("DELETE") for q, _ in conn.log) and len(conn.table) == 4


def test_step_d_rolls_back_if_deleted_count_differs(monkeypatch: pytest.MonkeyPatch) -> None:
    conn = DeleteConn()
    real = DeleteCursor.execute

    def execute(self: DeleteCursor, q: str, params: tuple[Any, ...] = ()) -> None:
        real(self, q, params)
        if q.startswith("DELETE"):
            self.rowcount += 1  # 確認した件数と違う

    monkeypatch.setattr(DeleteCursor, "execute", execute)
    with pytest.raises(SystemExit):
        run_d(monkeypatch, conn, ID_A, "yes")
    assert conn.rolled_back and not conn.committed


def test_step_d_report_has_no_connection_info(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GIFTIA_DB_HOST", "db.example.invalid")
    monkeypatch.setenv("GIFTIA_DB_USER", "someuser")
    monkeypatch.setenv("GIFTIA_DB_PASSWORD", "s3cretpw")
    rep = run_d(monkeypatch, DeleteConn(), ID_A, "yes")
    text = "\n".join(rep.lines)
    assert not any(v in text for v in ("db.example.invalid", "someuser", "s3cretpw"))


def test_main_turns_autocommit_off(monkeypatch: pytest.MonkeyPatch) -> None:
    conn = DeleteConn()
    assert conn.autocommit_on  # 接続直後は API 用の autocommit=True
    conn.close = lambda: None  # type: ignore[attr-defined]
    monkeypatch.setattr(database, "get_connection", lambda: conn)
    seen: list[bool] = []
    monkeypatch.setitem(db_admin.HANDLERS, "0", lambda c, rep: seen.append(c.autocommit_on))
    monkeypatch.setattr(db_admin, "EVIDENCE_DIR", Path(os.environ.get("TMPDIR", "/tmp")) / "db_admin_test_evidence")
    assert db_admin.main(["db_admin.py", "0"]) == 0
    assert seen == [False]  # 手順が動く時点で autocommit は切れている


def test_step_d_rollback_keeps_rows_when_autocommit_is_off(monkeypatch: pytest.MonkeyPatch) -> None:
    conn = DeleteConn()
    conn.autocommit(False)
    real = DeleteCursor.execute

    def execute(self: DeleteCursor, q: str, params: tuple[Any, ...] = ()) -> None:
        real(self, q, params)
        if q.startswith("DELETE"):
            self.rowcount += 1  # 確認した件数と違う

    monkeypatch.setattr(DeleteCursor, "execute", execute)
    with pytest.raises(SystemExit):
        run_d(monkeypatch, conn, f"{ID_A} {ID_B}", "yes")
    assert conn.rolled_back and len(conn.table) == 4 and ID_A in conn.table  # 行が残る


def test_step_d_without_autocommit_off_would_not_roll_back(monkeypatch: pytest.MonkeyPatch) -> None:
    """autocommit を切らないと ROLLBACK が効かない（この PR で切る理由の確認）"""
    conn = DeleteConn()  # autocommit_on のまま
    conn.delete([ID_A])
    conn.rollback()
    assert ID_A not in conn.table


def test_step_3_rollback_keeps_rows(monkeypatch: pytest.MonkeyPatch) -> None:
    conn = DeleteConn()  # is_test=1 の行は "Y" * 22 の 1 件
    conn.autocommit(False)
    answers = iter(["yes", "no"])  # 1 回目: 消す対象の確認、2 回目: 件数が合わない → COMMIT しない
    monkeypatch.setattr("builtins.input", lambda _="": next(answers))
    with pytest.raises(SystemExit):
        db_admin.step_3(conn, db_admin.Report("3"))
    assert conn.rolled_back and "Y" * 22 in conn.table and len(conn.table) == 4


def test_step_3_commit_deletes_only_marked_rows(monkeypatch: pytest.MonkeyPatch) -> None:
    conn = DeleteConn()
    conn.autocommit(False)
    answers = iter(["yes", "yes"])
    monkeypatch.setattr("builtins.input", lambda _="": next(answers))
    db_admin.step_3(conn, db_admin.Report("3"))
    assert conn.committed and set(conn.table) == {ID_A, ID_B, "Z" * 22}
