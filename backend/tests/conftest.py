# conftest.py — backend/ の中のファイル（config.py・db.py など）を import できるようにする
import sys
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

BACKEND = Path(__file__).resolve().parent.parent
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))


@pytest.fixture
def fd1_client() -> Iterator[TestClient]:
    """FD-1 と、その送別回数を持つ偽の DB につないだ API"""
    from candidates_support import CandidateDb, client_for, fd1, fd1_counts

    yield from client_for(CandidateDb(fd1(), fd1_counts()))


@pytest.fixture
def test_mark_on() -> Iterator[None]:
    """テスト用の印を 1 にする。差し替えはテストのコードの中だけ（D-19、NF-18）"""
    from fastapi import FastAPI

    import main
    from share_mark import get_test_mark

    app: FastAPI = main.app
    app.dependency_overrides[get_test_mark] = lambda: 1
    yield
    app.dependency_overrides.pop(get_test_mark, None)
