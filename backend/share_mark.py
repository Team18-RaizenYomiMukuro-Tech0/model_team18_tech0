# share_mark.py — 共有リンクに付ける「テスト用の印」を決める部品（設計.md N-09 / D-19）
# 印（share_links.is_test）は、テストのコードの中で app.dependency_overrides に
# 差し替え用の関数を入れたときだけ 1 になる。clock.py（D-11）と同じ作り方。
# 環境変数・クエリ・ヘッダー・リクエストの本文からは変えられない（NF-18、E-14）。


def get_test_mark() -> int:
    """FastAPI の依存（Depends）。本番版は常に 0（印なし）を返す"""
    return 0
