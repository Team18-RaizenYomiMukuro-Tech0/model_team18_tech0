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
lines.append("")

# --- 未決 E: MySQL のバージョンと JSON 型（5.7 以上で使える） ---
version = fetch_all("SELECT VERSION() AS v")[0]["v"]
major, minor = (int(x) for x in version.split("-")[0].split(".")[:2])
json_ok = (major, minor) >= (5, 7)
lines += ["## MySQL のバージョン（未決 E）", "",
          f"- バージョン: {version}",
          f"- JSON 型: {'使える（5.7 以上）' if json_ok else '使えない（5.7 未満。items は TEXT にする）'}", ""]

# --- 未決 1・2: 区分を表す列に入っている値の一覧（値ごとの件数） ---
# 個人に結びつく列（users の年代・性別、user_id など）は出さない。
# 列名はこの表に書いたものだけを使い、実在するかを information_schema で確かめてから引く。
CODE_COLUMNS = [
    ("products", "category", "未決2: 11カテゴリーとの対応の材料"),
    ("orders", "estimated_scene", "未決1: 推定シーン"),
    ("orders", "gift_purpose", "未決1: 贈る目的"),
    ("orders", "ship_to_type", "未決1: 送り先（会社宛てかの見分け方）"),
    ("product_scenes", "scene_tag", "未決1: 商品とシーンの結びつき"),
]
MAX_VALUES = 50
existing = {(c["t"], c["c"]) for c in columns}
lines += ["## 区分の値の一覧（未決 1・2 の材料）", "",
          f"値ごとの件数。{MAX_VALUES} 種類を超える列は先頭 {MAX_VALUES} 件だけ。", ""]
for table, col, why in CODE_COLUMNS:
    if (table, col) not in existing:
        lines += [f"### {table}.{col}（{why}）", "", "- この列はありません", ""]
        continue
    rows = fetch_all(
        f"SELECT `{col}` AS v, COUNT(*) AS n FROM `{table}` "  # 識別子は上の固定の表から。値は入れない
        f"GROUP BY `{col}` ORDER BY n DESC LIMIT {MAX_VALUES + 1}"
    )
    lines += [f"### {table}.{col}（{why}）", "", "| 値 | 件数 |", "| --- | --- |"]
    lines += [f"| {r['v'] if r['v'] is not None else '（空）'} | {r['n']} |" for r in rows[:MAX_VALUES]]
    if len(rows) > MAX_VALUES:
        lines.append(f"| …（{MAX_VALUES} 種類を超えるため省略） | |")
    lines.append("")

# --- SSL で接続できているか（画面にだけ出す。ファイルには書かない） ---
cipher = fetch_all("SHOW SESSION STATUS LIKE 'Ssl_cipher'")
cipher_value = cipher[0]["Value"] if cipher else ""

text = "\n".join(lines) + "\n"
print(text)
print(f"SSL の暗号方式: {cipher_value or '（空。SSL で接続できていません）'}")
with open("db_schema.md", "w", encoding="utf-8") as f:
    f.write(text)
print("→ db_schema.md に書き出しました")
