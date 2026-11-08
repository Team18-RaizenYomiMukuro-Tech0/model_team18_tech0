# clock.py — 現在時刻を返す部品（設計.md D-11）
# 期限判定と created_at の記録は datetime.now() を直接呼ばず、ここから時刻を受け取る。
# テストでだけ、テストのコードの中で app.dependency_overrides に固定の Clock を入れる。
# 環境変数・クエリ・ヘッダーからは差し替えられない（E-14）。
from datetime import UTC, datetime


class Clock:
    """本番の時計。アプリのサーバー時刻（UTC）を返す"""

    def now(self) -> datetime:
        return datetime.now(UTC)


def get_clock() -> Clock:
    """FastAPI の依存（Depends）。本番版だけを返す"""
    return Clock()
