# 完了条件 #1（U-15、設計.md D-06・D-11）: 期限の判定 is_expired を直接呼ぶ。DB も時計も使わない。
from datetime import UTC, datetime, timedelta

import pytest

from expiry import is_expired

CREATED = datetime(2026, 11, 1, 0, 0, 0)  # 時間帯なし（DB の created_at と同じ。UTC として扱う）


# SP-06 D-06 D-11 U-15
@pytest.mark.parametrize(
    ("seconds", "expired"),
    [
        (2_591_999, False),  # 719 時間 59 分 59 秒
        (2_592_000, False),  # 720 時間ちょうど
        (2_592_001, True),  # 720 時間 0 分 1 秒
        (31 * 24 * 3600, True),  # 31 日
        (0, False),
    ],
)
def test_is_expired(seconds: int, expired: bool) -> None:
    assert is_expired(CREATED, CREATED + timedelta(seconds=seconds)) is expired


def test_timezone_aware_now_is_same_as_naive() -> None:
    """now に時間帯（UTC）が付いていても、付いていなくても同じ判定（Clock は UTC の時刻を返す）"""
    now = (CREATED + timedelta(seconds=2_592_001)).replace(tzinfo=UTC)
    assert is_expired(CREATED, now) is True
    assert is_expired(CREATED, now - timedelta(seconds=1)) is False
