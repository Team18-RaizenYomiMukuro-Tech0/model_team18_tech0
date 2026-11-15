"""完了条件 #1〜#3（#136）。手元の SQLite（tmp_path）だけを使う。"""
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import app as trial

SECRET = "test-only-secret-not-used-anywhere-else-0123456789"


class Clock:
    t = 1_800_000_000.0

    def __call__(self) -> float:
        return self.t


@pytest.fixture
def clock() -> Clock:
    return Clock()


@pytest.fixture
def client(tmp_path: Path, clock: Clock) -> TestClient:
    a = trial.make_app(str(tmp_path / "t.sqlite3"), jwt_secret=SECRET, now=clock)
    trial.create_user(a.state.db, "alice", "correct-horse")
    return TestClient(a)


# ---- #1 bcrypt ----
def test_c1_password_is_bcrypt_hash(client: TestClient) -> None:
    db = client.app.state.db  # type: ignore[attr-defined]
    h = db.execute("SELECT password_hash FROM users WHERE username='alice'").fetchone()[0]
    assert h.startswith("$2b$") and "correct-horse" not in h
    print("password_hash 先頭:", h[:7] + "…")


# ---- #2 セッション Cookie ----
def test_c2_session_cookie_flow(client: TestClient) -> None:
    assert client.get("/session/me").status_code == 401  # ログイン前は見えない
    bad = client.post("/session/login", json={"username": "alice", "password": "wrong"})
    assert bad.status_code == 401 and client.get("/session/me").status_code == 401  # 間違いは拒否
    assert client.post("/session/login", json={"username": "alice", "password": "correct-horse"}).status_code == 200
    r = client.get("/session/me")
    assert r.status_code == 200 and r.json() == {"user": "alice"}  # 正しいときだけ見える
    assert client.post("/session/logout").status_code == 200
    assert client.get("/session/me").status_code == 401  # ログアウト後は見えない


def test_c2_session_expires(client: TestClient, clock: Clock) -> None:
    client.post("/session/login", json={"username": "alice", "password": "correct-horse"})
    clock.t += trial.SESSION_TTL + 1
    assert client.get("/session/me").status_code == 401


# ---- #3 JWT ----
def test_c3_jwt_flow(client: TestClient) -> None:
    assert client.get("/jwt/me").status_code == 401
    assert client.post("/jwt/login", json={"username": "alice", "password": "wrong"}).status_code == 401
    token = client.post("/jwt/login", json={"username": "alice", "password": "correct-horse"}).json()["access_token"]
    ok = client.get("/jwt/me", headers={"Authorization": f"Bearer {token}"})
    assert ok.status_code == 200 and ok.json() == {"user": "alice"}
    assert client.get("/jwt/me", headers={"Authorization": f"Bearer {token}x"}).status_code == 401  # 改ざん


def test_c3_jwt_expired_rejected(client: TestClient, clock: Clock) -> None:
    token = client.post("/jwt/login", json={"username": "alice", "password": "correct-horse"}).json()["access_token"]
    clock.t += trial.JWT_TTL + 1
    r = client.get("/jwt/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401 and r.json()["detail"] == "token expired"


def test_c3_jwt_logout_cannot_revoke(client: TestClient) -> None:
    """違いの確認: JWT は期限まで有効（サーバーに取り消す場所が無い）。セッションは logout 直後に無効"""
    token = client.post("/jwt/login", json={"username": "alice", "password": "correct-horse"}).json()["access_token"]
    client.post("/session/logout")  # JWT には何の効き目も無い
    assert client.get("/jwt/me", headers={"Authorization": f"Bearer {token}"}).status_code == 200
