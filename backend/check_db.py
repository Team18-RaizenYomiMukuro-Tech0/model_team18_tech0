# check_db.py — 班の DB の構造（テーブル・列・件数・つながり）を表示し、db_schema.md に書き出す
# 実行：python check_db.py（backend フォルダで、仮想環境に入ってから）
# 読むだけ。DB の中身は変えない。接続情報は書き出さない。
from database import fetch_all

tables = fetch_all(
    "SELECT table_name AS name, table_rows AS approx_rows "
    "FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name"
)
columns = fetch_all(
    "SELECT table_name AS t, column_name AS c, column_type AS type, is_nullable AS nullable, "
    "column_key AS k, column_comment AS note "
    "FROM information_schema.columns WHERE table_schema = DATABASE() "
    "ORDER BY table_name, ordinal_position"
)
links = fetch_all(
    "SELECT table_name AS t, column_name AS c, referenced_table_name AS rt, referenced_column_name AS rc "
    "FROM information_schema.key_column_usage "
    "WHERE table_schema = DATABASE() AND referenced_table_name IS NOT NULL ORDER BY table_name"
)

lines = ["# 班の DB の構造", "", f"テーブル数: {len(tables)}", ""]
for t in tables:
    lines += [f"## {t['name']}（約 {t['approx_rows']} 件）", "",
              "| 列 | 型 | 空を許す | キー | 説明 |", "| --- | --- | --- | --- | --- |"]
    for c in columns:
        if c["t"] == t["name"]:
            lines.append(f"| {c['c']} | {c['type']} | {c['nullable']} | {c['k']} | {c['note']} |")
    lines.append("")

lines += ["## テーブル同士のつながり（外部キー）", ""]
if links:
    lines += [f"- {l['t']}.{l['c']} → {l['rt']}.{l['rc']}" for l in links]
else:
    lines.append("- 外部キーは設定されていません（同じ名前の列を手がかりに読む）")

text = "\n".join(lines) + "\n"
print(text)
with open("db_schema.md", "w", encoding="utf-8") as f:
    f.write(text)
print("→ db_schema.md に書き出しました")
