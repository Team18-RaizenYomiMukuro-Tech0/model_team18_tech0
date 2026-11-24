# conftest.py — backend/ の中のファイル（config.py・db.py など）を import できるようにする
import sys
from collections.abc import Iterator
from pathlib import Path
from typing import TYPE_CHECKING

import pytest
from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from catalog_support import Rig

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


@pytest.fixture(autouse=True)
def catalog_off(monkeypatch: pytest.MonkeyPatch) -> None:
    """既存のテストは、メモリの入れ物（D-50）を使わず今の DB 直の道で確かめる。入れ物のテストだけが、自分の入れ物に差し替える"""
    import catalog

    monkeypatch.setattr(catalog, "_CATALOG", catalog.Catalog(enabled=False))


@pytest.fixture
def rig_sync() -> Iterator["Rig"]:
    """入れ物（D-50）の読み込みを同期で終わらせる版（テストでだけ）を、偽の DB・固定の時計とつないだ API"""
    from catalog_support import make_rig, many_db

    from catalog import Catalog

    yield from make_rig(many_db(), Catalog(sync=True))


@pytest.fixture
def rig_async() -> Iterator["Rig"]:
    """入れ物（D-50）を本番と同じ、裏で読み込む版にした API"""
    from catalog_support import make_rig, many_db

    from catalog import Catalog

    yield from make_rig(many_db(), Catalog())
