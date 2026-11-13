# expiry.py — 共有リンクの期限の判定（設計.md D-06・D-11、DATA-02、仕様 SP-06）
# 純粋な関数。現在時刻 now は引数で受け取り、datetime.now() を直接呼ばない（時計は clock.py から渡す）。
# ちょうど有効期間（SETTINGS.SHARE_EXPIRY_HOURS）までは有効、1 秒でも過ぎたら期限切れ（#30 H）。秒で比べる。
from datetime import UTC, datetime

from config import SETTINGS


def _utc(value: datetime) -> datetime:
    """時刻に時間帯が付いていなければ UTC として扱う（DB の created_at は UTC で時間帯なし）"""
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


# SP-06 D-06 D-11 U-15
def is_expired(created_at: datetime, now: datetime) -> bool:
    """now − created_at が有効期間を 1 秒でも超えたら True"""
    elapsed = (_utc(now) - _utc(created_at)).total_seconds()
    return elapsed > SETTINGS.SHARE_EXPIRY_HOURS * 3600
