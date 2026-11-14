# Issue #67: backend/perf/measure.py の集計・判定（実 API・DB には繋がない）
import importlib.util
from datetime import datetime
from pathlib import Path

import pytest

_PATH = Path(__file__).resolve().parent.parent / "perf" / "measure.py"
_spec = importlib.util.spec_from_file_location("perf_measure", _PATH)
assert _spec is not None and _spec.loader is not None
m = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(m)

VALUES = [0.5, 0.2, 0.9, 0.3, 0.4, 0.1, 0.8, 0.6, 0.7, 1.5]  # 小さい順の 9 番目は 0.9


def test_sort_and_judge_is_ninth_smallest() -> None:
    assert m.sort_values(VALUES) == [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.5]
    assert m.judge_value(VALUES) == 0.9  # 一番遅い 1.5 は判定に使わない


def test_judge_needs_ten_values() -> None:
    with pytest.raises(ValueError):
        m.judge_value([0.1] * 9)
    with pytest.raises(ValueError):
        m.judge_value([0.1] * 11)


def test_seconds_text_three_decimals() -> None:
    assert m.seconds_text(1) == "1.000"
    assert m.seconds_text(0.12345) == "0.123"


def test_is_within_boundary() -> None:
    assert m.is_within(2.0, 2.0)
    assert m.is_within(2.0004, 2.0)  # 小数 3 桁に丸めると 2.000
    assert not m.is_within(2.001, 2.0)


def _md(name: str, values: list[float], statuses: list[int]) -> str:
    return m.render_markdown(name, values, statuses, datetime(2026, 11, 14, 10, 0, 0))


def test_render_pass() -> None:
    md = _md("create", VALUES, [201] * 10)
    assert "判定の値（小さい順の 9 番目）: 0.900 秒" in md
    assert "基準: 1 秒以内（応答は 201）" in md
    assert "判定: ○" in md
    assert "小さい順: 0.100, 0.200, 0.300" in md
    assert "| 10 | 1.500 | 201 |" in md


def test_render_fail_over_limit() -> None:
    slow = [0.5] * 8 + [1.2, 3.0]
    md = _md("create", slow, [201] * 10)
    assert "判定の値（小さい順の 9 番目）: 1.200 秒" in md
    assert "判定: ×" in md


def test_render_fail_on_unexpected_status() -> None:
    md = _md("candidates", [0.1] * 10, [200] * 9 + [500])
    assert "判定: ×（応答の状態コードが期待と違う回あり）" in md


def test_render_has_no_connection_info() -> None:
    md = _md("candidates-no-band", [0.1] * 10, [200] * 10)
    assert "127.0.0.1" not in md and "password" not in md.lower()
    assert "（だーあさが記入）" in md


def test_targets_match_design() -> None:
    assert m.TARGETS["candidates"]["limit"] == 2.0 and m.TARGETS["candidates-no-band"]["limit"] == 2.0
    assert m.TARGETS["create"]["limit"] == 1.0 and m.TARGETS["create"]["status"] == 201
    assert m.TARGETS["get"]["limit"] == 1.0 and m.TARGETS["get"]["status"] == 200
    assert "price_band=3000to4999" in m.CANDIDATES_BAND and "price_band" not in m.CANDIDATES_NO_BAND


def test_measure_runs_ten_times_from_first() -> None:
    calls: list[int] = []

    def once() -> tuple[float, int]:
        calls.append(1)
        return 0.01 * len(calls), 200

    values, statuses = m.measure(once)
    assert len(calls) == 10 and values[0] == 0.01 and statuses == [200] * 10
