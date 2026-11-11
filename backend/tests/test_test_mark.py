# T1 #54 完了条件 #3: テスト用の印を決める依存（設計.md N-09 / D-19、NF-18、E-14）
# 確かめ用の小さなアプリはこのファイルの中だけで作り、main.py は使わない。
from collections.abc import Iterator

import pytest
from fastapi import Depends, FastAPI, Request
from fastapi.testclient import TestClient

from share_mark import get_test_mark


def _make_app() -> FastAPI:
    app = FastAPI()

    @app.post("/mark")
    async def mark(request: Request, mark: int = Depends(get_test_mark)) -> dict[str, int]:
        await request.body()
        return {"is_test": mark}

    return app


@pytest.fixture
def app() -> FastAPI:
    return _make_app()


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    yield TestClient(app)


@pytest.fixture
def marked_client(app: FastAPI) -> Iterator[TestClient]:
    app.dependency_overrides[get_test_mark] = lambda: 1
    yield TestClient(app)
    app.dependency_overrides.clear()


# SP-05 / D-19 / NF-18: 既定は 0（印なし）
def test_default_mark_is_zero(client: TestClient) -> None:
    assert get_test_mark() == 0
    assert client.post("/mark").json() == {"is_test": 0}


# SP-05 / D-19 / NF-18: テストのコードで差し替えたときだけ 1
def test_override_in_test_code_gives_one(marked_client: TestClient) -> None:
    assert marked_client.post("/mark").json() == {"is_test": 1}


# SP-05 / NF-18 / E-14: 本文・クエリ・ヘッダーでは変わらない
def test_request_cannot_change_mark(client: TestClient) -> None:
    res = client.post(
        "/mark?is_test=1&test_mark=1",
        json={"is_test": 1, "test_mark": 1},
        headers={"X-Is-Test": "1", "X-Test-Mark": "1", "is_test": "1"},
    )
    assert res.json() == {"is_test": 0}


# SP-05 / NF-18 / E-14: 環境変数では変わらない
def test_env_cannot_change_mark(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    for name in ("IS_TEST", "TEST_MARK", "GIFTIA_TEST_MARK"):
        monkeypatch.setenv(name, "1")
    assert client.post("/mark").json() == {"is_test": 0}


# SP-05 / D-19: conftest の差し替えフィクスチャで 1 になる
def test_fixture_sets_override(test_mark_on: None) -> None:
    import main

    assert main.app.dependency_overrides[get_test_mark]() == 1


# SP-05 / D-19: 上のテストが終わった後は差し替えが残らず 0 に戻る（ファイル内の順に実行）
def test_fixture_override_is_removed_after() -> None:
    import main

    assert get_test_mark not in main.app.dependency_overrides
