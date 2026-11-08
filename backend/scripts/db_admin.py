# db_admin.py — DB管理手順.md の SQL を、mysql コマンドなしで1手順ずつ流す道具（B2 / Issue #56）
# 使い方（backend フォルダで、仮想環境に入ってから）:
#   python scripts/db_admin.py <手順>      手順 = 0 | A | 1 | B | Bt | B5 | 3 | 4 | C
# 決まり:
# - SQL は DB管理手順.md と一字一句同じ（tests/test_db_admin.py が手順書と照合する）。手順書に無い SQL は足さない。
# - 接続先は database.py の giftia_t501（定数）。引数・環境変数では変えられない。SSL は certifi＋ホスト名の確認（#71）。
# - 接続情報は backend/.env から読む。画面にもファイルにも出さない（出力のホスト・ユーザー・パスワードは <伏せ> にする）。
# - 書き込む手順（1・B・B5・3・4）は、先に SELECT DATABASE() と対象の SELECT の結果を出し、yes の入力を待つ。
# - 出力は 02_プロジェクト/giftia-ui-renewal/evidence/db/<日付>_<手順>.md に保存する。
import json
import os
import re
import sys
from collections.abc import Callable
from datetime import date
from pathlib import Path
from typing import Any

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))
import database  # backend/database.py（接続の作り方をアプリと同じにする）

EVIDENCE_DIR = (
    BACKEND.parent / "02_プロジェクト" / "giftia-ui-renewal" / "evidence" / "db"
)
EXPECTED_VERSION_PREFIX = "8.4.9"  # 手順0: 違うバージョンが出たら止まる（#54-1）
# 手順A: 既存テーブルの7つ（#54）。SHOW TABLES と一致しなければ止まる。
EXISTING_TABLES = [
    "order_items",
    "orders",
    "product_facts",
    "product_scenes",
    "products",
    "reviews",
    "users",
]

# ---- 手順書の SQL（一字一句同じ。照合は tests/test_db_admin.py） ----
SQL_0 = [
    "SELECT CURRENT_USER(), DATABASE(), VERSION();",
    "SHOW STATUS LIKE 'Ssl_cipher';",
]
SQL_A = [
    """SELECT table_name, column_name, column_type, is_nullable, column_key
  FROM information_schema.columns WHERE table_schema = DATABASE()
  ORDER BY table_name, ordinal_position;""",
    """SELECT table_name, table_rows FROM information_schema.tables
  WHERE table_schema = DATABASE() ORDER BY table_name;""",
]
SQL_A_COUNT = "SELECT COUNT(*) FROM <既存テーブル>;"  # <既存テーブル> を EXISTING_TABLES で置き換える
SQL_1_PRE = ["SHOW TABLES LIKE 'share_links';"]
SQL_1 = """CREATE TABLE share_links (
  share_id   CHAR(22) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  items      JSON NOT NULL,
  created_at DATETIME NOT NULL,
  is_test    TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (share_id)
);"""
SQL_1_POST = [
    "SHOW CREATE TABLE share_links;",
    "SELECT COUNT(*) FROM share_links;",
    "SHOW TABLES;",
]
SQL_B_PRE = [
    "SELECT share_id FROM share_links WHERE share_id = 'AAAAAAAAAAAAAAAAAAAAAA';"
]
SQL_B = """INSERT INTO share_links (share_id, items, created_at, is_test)
VALUES ('AAAAAAAAAAAAAAAAAAAAAA', JSON_ARRAY(JSON_OBJECT('product_id','G0001','name','テスト','price',1000,'reason','手順書の確認用')), UTC_TIMESTAMP(), 0);"""
SQL_BT = """INSERT INTO share_links (share_id, items, created_at, is_test)
VALUES ('BBBBBBBBBBBBBBBBBBBBBB', JSON_ARRAY(JSON_OBJECT('product_id','G0001','name','テスト','price',1000,'reason','手順書の確認用')), UTC_TIMESTAMP(), 1);"""
SQL_B_POST = [
    "SELECT is_test, COUNT(*) FROM share_links GROUP BY is_test;",
    "SELECT share_id FROM share_links WHERE share_id = 'AAAAAAAAAAAAAAAAAAAAAA';",
]
SQL_B5 = (
    "DELETE FROM share_links WHERE share_id = 'AAAAAAAAAAAAAAAAAAAAAA' AND is_test = 0;"
)
SQL_B5_POST = ["SELECT is_test, COUNT(*) FROM share_links GROUP BY is_test;"]
SQL_3_PRE = [
    "SELECT COUNT(*) FROM share_links;",
    "SELECT is_test, COUNT(*) FROM share_links GROUP BY is_test;",
    """SELECT share_id, created_at, LEFT(CAST(items AS CHAR), 120) AS items_head
  FROM share_links WHERE is_test = 1 ORDER BY created_at;""",
]
SQL_3_START = "START TRANSACTION;"
SQL_3_DELETE = "DELETE FROM share_links WHERE is_test = 1;"
SQL_3_COUNT = "SELECT ROW_COUNT();"
SQL_3_COMMIT = "COMMIT;"
SQL_3_ROLLBACK = "ROLLBACK;"
SQL_3_POST = [
    "SELECT COUNT(*) FROM share_links WHERE is_test = 1;",
    "SELECT is_test, COUNT(*) FROM share_links GROUP BY is_test;",
]
SQL_4_PRE = ["SELECT COUNT(*) FROM share_links;", "SHOW TABLES;"]
SQL_4 = "DROP TABLE share_links;"
SQL_4_POST = ["SHOW TABLES LIKE 'share_links';", "SHOW TABLES;"]

STEPS = ["0", "A", "1", "B", "Bt", "B5", "3", "4", "C"]


class Report:
    """画面に出す文を集め、最後に evidence へ保存する。接続情報の値は <伏せ> にする。"""

    def __init__(self, step: str) -> None:
        self.step = step
        self.lines: list[str] = []
        self.secrets = [
            v
            for k in ("GIFTIA_DB_HOST", "GIFTIA_DB_USER", "GIFTIA_DB_PASSWORD")
            if len(v := os.environ.get(k, "")) >= 3
        ]

    def scrub(self, text: str) -> str:
        for v in sorted(self.secrets, key=len, reverse=True):
            text = text.replace(v, "<伏せ>")
        return text

    def say(self, text: str = "") -> None:
        text = self.scrub(text)
        print(text)
        self.lines.append(text)

    def sql(self, statement: str) -> None:
        self.say("```sql")
        self.say(statement)
        self.say("```")

    def table(self, rows: list[dict[str, Any]]) -> None:
        if not rows:
            self.say("（0 行）")
            return
        cols = list(rows[0].keys())
        self.say("| " + " | ".join(cols) + " |")
        self.say("| " + " | ".join("---" for _ in cols) + " |")
        for r in rows:
            cells = (str(r[c]).replace("|", "\\|").replace("\n", " ") for c in cols)
            self.say("| " + " | ".join(cells) + " |")

    def save(self) -> Path:
        EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
        stem = f"{date.today().isoformat()}_{self.step}"
        path = EVIDENCE_DIR / f"{stem}.md"
        n = 2
        while path.exists():  # 既存の記録を上書きしない
            path = EVIDENCE_DIR / f"{stem}_{n}.md"
            n += 1
        header = [
            f"# DB 手順 {self.step} の実行記録",
            "",
            f"- 日付: {date.today().isoformat()}",
            "- 道具: backend/scripts/db_admin.py（接続先 giftia_t501 固定、certifi＋ホスト名の確認）",
            "- ホスト・ユーザー・パスワードは <伏せ>",
            "",
        ]
        path.write_text("\n".join(header + self.lines) + "\n", encoding="utf-8")
        return path


def run(conn: Any, rep: Report, statement: str) -> list[dict[str, Any]]:
    """1 文を流し、文と結果を記録する"""
    rep.sql(statement)
    with conn.cursor() as cur:
        cur.execute(statement)
        rows: list[dict[str, Any]] = list(cur.fetchall())
    rep.table(rows)
    rep.say()
    return rows


def run_many(conn: Any, rep: Report, statements: list[str]) -> None:
    for s in statements:
        run(conn, rep, s)


def confirm(rep: Report, what: str) -> None:
    """yes と入力されるまで書き込まない"""
    answer = input(f"{what} よろしければ yes と入力: ")
    rep.say(f"確認の入力: {'yes' if answer == 'yes' else '（yes 以外。中止）'}")
    if answer != "yes":
        raise SystemExit("中止しました（何も書き込んでいません）")


def check_database(conn: Any, rep: Report) -> None:
    rows = run(conn, rep, "SELECT DATABASE();")
    if rows[0]["DATABASE()"] != database.DB_NAME:
        raise SystemExit(f"接続先が {database.DB_NAME} ではありません。止めます")


def show_tables(conn: Any) -> list[str]:
    with conn.cursor() as cur:
        cur.execute("SHOW TABLES;")
        return [str(next(iter(r.values()))) for r in cur.fetchall()]


def table_exists(conn: Any) -> bool:
    with conn.cursor() as cur:
        cur.execute("SHOW TABLES LIKE 'share_links';")
        return bool(cur.fetchall())


def step_0(conn: Any, rep: Report) -> None:
    rows = run(conn, rep, SQL_0[0])
    run(conn, rep, SQL_0[1])
    version = str(rows[0]["VERSION()"])
    if not version.startswith(EXPECTED_VERSION_PREFIX):
        raise SystemExit(
            "VERSION() が想定（8.4.9-azure）と違います。止まって相談してください（手順0）"
        )
    rep.say(
        "確かめ: DATABASE() が giftia_t501、VERSION() が 8.4.9 系、Ssl_cipher が空でないこと。"
    )


def snapshot(conn: Any, rep: Report) -> dict[str, Any]:
    """手順A: 既存テーブルの定義と件数を取る（読み取りだけ）"""
    existing = [t for t in show_tables(conn) if t != "share_links"]
    if sorted(existing) != sorted(EXISTING_TABLES):
        raise SystemExit(
            "既存テーブルが手順書の7つと違います。止まって相談してください"
        )
    cols = run(conn, rep, SQL_A[0])
    run(conn, rep, SQL_A[1])
    counts: dict[str, int] = {}
    for t in EXISTING_TABLES:
        r = run(conn, rep, SQL_A_COUNT.replace("<既存テーブル>", t))
        counts[t] = int(next(iter(r[0].values())))
    # 比べる対象は既存7表だけ。share_links 自身の列は除く（作った後の C が不合格になるため）
    return {
        "columns": [
            {k: str(v) for k, v in c.items()}
            for c in cols
            if str(c["TABLE_NAME"]) in EXISTING_TABLES
        ],
        "counts": counts,
    }


def step_a(conn: Any, rep: Report) -> None:
    snap = snapshot(conn, rep)
    rep.say("## 控え（手順C が比べるための記録）")
    rep.say("```json")
    rep.say(json.dumps(snap, ensure_ascii=False))
    rep.say("```")


def step_1(conn: Any, rep: Report) -> None:
    check_database(conn, rep)
    run_many(conn, rep, SQL_1_PRE)
    if table_exists(conn):
        raise SystemExit(
            "share_links がすでにあります。作りません（手順1。中身を見てレージが判断）"
        )
    rep.say("これから実行する文:")
    rep.sql(SQL_1)
    confirm(rep, "share_links を作ります。")
    with conn.cursor() as cur:
        cur.execute(SQL_1)
    conn.commit()
    run_many(conn, rep, SQL_1_POST)


def step_b(conn: Any, rep: Report) -> None:
    check_database(conn, rep)
    if not table_exists(conn):
        raise SystemExit("share_links がありません。先に手順1を行ってください")
    pre = run(conn, rep, SQL_B_PRE[0])
    if pre:
        raise SystemExit("印なしの確認用の行がすでにあります。入れません")
    rep.say("これから実行する文（is_test = 0 の確認用の行を1行置く）:")
    rep.sql(SQL_B)
    confirm(rep, "確認用の行を1行入れます。")
    with conn.cursor() as cur:
        cur.execute(SQL_B)
    conn.commit()
    run_many(conn, rep, SQL_B_POST)


def step_bt(conn: Any, rep: Report) -> None:
    """手順B の1b: 印あり（is_test = 1）の行を1行置く。手順3 が消す対象"""
    check_database(conn, rep)
    if not table_exists(conn):
        raise SystemExit("share_links がありません。先に手順1を行ってください")
    run(conn, rep, SQL_B_POST[0])
    rep.say("これから実行する文（is_test = 1 の確認用の行を1行置く）:")
    rep.sql(SQL_BT)
    confirm(rep, "印ありの確認用の行を1行入れます。")
    with conn.cursor() as cur:
        cur.execute(SQL_BT)
    conn.commit()
    run(conn, rep, SQL_B_POST[0])


def step_b5(conn: Any, rep: Report) -> None:
    check_database(conn, rep)
    pre = run(conn, rep, SQL_B_PRE[0])
    if len(pre) != 1:
        raise SystemExit("確認用の行が1行ではありません。消しません")
    rep.say("これから実行する文（手順Bで置いた確認用の行だけを消す）:")
    rep.sql(SQL_B5)
    confirm(rep, "確認用の行を1行消します。")
    with conn.cursor() as cur:
        cur.execute(SQL_B5)
        rep.say(f"消した行数: {cur.rowcount}")
    conn.commit()
    run_many(conn, rep, SQL_B5_POST)


def step_3(conn: Any, rep: Report) -> None:
    check_database(conn, rep)
    run_many(conn, rep, SQL_3_PRE)
    rep.say("これから実行する文（is_test = 1 の行だけを消す。WHERE は手順書のとおり）:")
    rep.sql(f"{SQL_3_START}\n{SQL_3_DELETE}\n{SQL_3_COUNT}")
    confirm(rep, "上の件数と中身が、消したい行だけであることを確かめました。")
    with conn.cursor() as cur:
        cur.execute(SQL_3_START)
        cur.execute(SQL_3_DELETE)
        cur.execute(SQL_3_COUNT)
        deleted = list(cur.fetchall())
    rep.sql(SQL_3_COUNT)
    rep.table(deleted)
    try:
        confirm(rep, "消した件数が、実行前の確認と合っています。COMMIT します。")
    except SystemExit:
        conn.rollback()
        rep.say(SQL_3_ROLLBACK)
        raise
    conn.commit()
    rep.say(SQL_3_COMMIT)
    run_many(conn, rep, SQL_3_POST)


def step_4(conn: Any, rep: Report) -> None:
    check_database(conn, rep)
    run_many(conn, rep, SQL_4_PRE)
    if not table_exists(conn):
        raise SystemExit("share_links がありません。消すものがありません")
    rep.say("これから実行する文（中の行は戻らない）:")
    rep.sql(SQL_4)
    confirm(rep, "share_links を消します。")
    with conn.cursor() as cur:
        cur.execute(SQL_4)
    conn.commit()
    run_many(conn, rep, SQL_4_POST)


def latest_snapshot() -> dict[str, Any]:
    """手順A の最新の記録から、控え（JSON）を読む"""
    files = sorted(
        (f for f in EVIDENCE_DIR.glob("*.md") if re.search(r"_A(_\d+)?\.md$", f.name)),
        key=lambda f: f.stat().st_mtime,
    )
    if not files:
        raise SystemExit("手順A の記録がありません。先に A を実行してください")
    text = files[-1].read_text(encoding="utf-8")
    m = re.search(r"```json\n(.*?)\n```", text, re.DOTALL)
    if not m:
        raise SystemExit(f"{files[-1].name} に控えがありません")
    data: dict[str, Any] = json.loads(m.group(1))
    return data


def step_c(conn: Any, rep: Report) -> None:
    before = latest_snapshot()
    now = snapshot(conn, rep)
    same_cols = before["columns"] == now["columns"]
    same_counts = before["counts"] == now["counts"]
    rep.say("## 比べた結果（手順A の控え と 今）")
    rep.say(f"- 既存テーブルの列・型: {'同じ' if same_cols else '違う'}")
    rep.say(f"- 既存テーブルの件数: {'同じ' if same_counts else '違う'}")
    rep.say(
        f"- share_links: {'ある' if table_exists(conn) else '無い'}（SHOW TABLES LIKE 'share_links';）"
    )
    if not (same_cols and same_counts):
        rep.say("→ 不合格。違いを調べて報告する")


HANDLERS: dict[str, Callable[[Any, Report], None]] = {
    "0": step_0,
    "A": step_a,
    "1": step_1,
    "B": step_b,
    "Bt": step_bt,
    "B5": step_b5,
    "3": step_3,
    "4": step_4,
    "C": step_c,
}


def main(argv: list[str]) -> int:
    if len(argv) != 2 or argv[1] not in STEPS:
        print(f"使い方: python scripts/db_admin.py <{' | '.join(STEPS)}>")
        return 2
    step = argv[1]
    rep = Report(step)
    conn = database.get_connection()
    try:
        HANDLERS[step](conn, rep)
    except SystemExit as e:
        rep.say(f"止まりました: {e}")
        rep.save()
        raise
    except Exception as e:  # noqa: BLE001  # DB のエラー文に接続情報が入ることがあるので、伏せて出す
        rep.say(f"エラー: {type(e).__name__}: {e}")
        rep.save()
        return 1
    finally:
        conn.close()
    path = rep.save()
    print(f"→ {path.name} に保存しました")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
