# 完了条件 #1（NF-31、設計.md N-14）: 変えうる値が config.py の 1 か所にあり、ほかに同じ数が書かれていない
import dataclasses
import re
from pathlib import Path

import pytest

from config import SETTINGS, Settings

BACKEND = Path(__file__).resolve().parent.parent


def test_SP_N14_values() -> None:
    assert SETTINGS.BAYES_K == 20
    assert SETTINGS.TOP_N == 10
    assert SETTINGS.HIGH_RATING_MIN == 4.5
    assert SETTINGS.BUDGET_MIN == 1000
    assert SETTINGS.BUDGET_MAX == 999999
    assert SETTINGS.SHARE_MAX_ITEMS == 10
    assert SETTINGS.SHARE_EXPIRY_HOURS == 720
    assert SETTINGS.SHARE_ID_LENGTH == 22
    assert SETTINGS.REQUEST_TIMEOUT_SECONDS == 10
    assert SETTINGS.SHARE_REQUEST_MAX_LENGTH == 50


def test_settings_are_frozen_and_ignore_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    with pytest.raises(dataclasses.FrozenInstanceError):
        SETTINGS.TOP_N = 99  # type: ignore[misc]  # 変更できないことを確かめるため、わざと代入する
    for name in ("TOP_N", "REQUEST_TIMEOUT_SECONDS", "SHARE_EXPIRY_HOURS", "BAYES_K"):
        monkeypatch.setenv(name, "1")
    assert Settings() == SETTINGS  # 環境変数で値は変わらない


def test_no_magic_numbers_outside_config() -> None:
    """720・999999 は config.py 以外のコード（tests を除く）に直接書かれていない"""
    hits = []
    for p in BACKEND.glob("*.py"):
        if p.name == "config.py":
            continue
        for n, line in enumerate(p.read_text(encoding="utf-8").splitlines(), 1):
            if re.search(r"\b(720|999999)\b", line):
                hits.append(f"{p.name}:{n}")
    assert hits == []
