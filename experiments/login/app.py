"""ログインの試作（#136・ADR-005）。手元の SQLite だけを使う。班の DB・秘密の設定ファイル・クラウドには触れない。
main には入れない（ブランチ experiment/login だけ）。"""
import secrets
import sqlite3
import time
from typing import Any

import bcrypt
import jwt
from fastapi import Cookie, Depends, FastAPI, Header, HTTPException, Response
from pydantic import BaseModel

SESSION_TTL = 3600  # 秒。セッション Cookie 方式の有効期限（サーバーの表に持つ）
JWT_TTL = 900  # 秒。JWT 方式の有効期限（トークンの中に持つ）
JWT_ALG = "HS256"
COOKIE = "session_id"


class Creds(BaseModel):
    username: str
    password: str


def connect(path: str) -> sqlite3.Connection:
    db = sqlite3.connect(path, check_same_thread=False)
    db.row_factory = sqlite3.Row
    db.execute("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL)")
    db.execute("CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at REAL NOT NULL)")
    return db


def create_user(db: sqlite3.Connection, username: str, password: str) -> None:
    h = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()  # 先頭は $2b$
    db.execute("INSERT INTO users (username, password_hash) VALUES (?, ?)", (username, h))
    db.commit()


def check_password(db: sqlite3.Connection, username: str, password: str) -> int | None:
    row = db.execute("SELECT id, password_hash FROM users WHERE username = ?", (username,)).fetchone()
    if row is None:  # ユーザーの有無で時間が変わらないよう、ダミーのハッシュとも比べる
        bcrypt.checkpw(b"x", _DUMMY)
        return None
    return int(row["id"]) if bcrypt.checkpw(password.encode(), row["password_hash"].encode()) else None


_DUMMY = bcrypt.hashpw(b"dummy", bcrypt.gensalt())


def make_app(db_path: str = "login_trial.sqlite3", jwt_secret: str | None = None, now: Any = time.time) -> FastAPI:
    """jwt_secret は呼び出し側が渡す。無ければ起動ごとにランダム（どこにも保存しない）"""
    db = connect(db_path)
    secret = jwt_secret or secrets.token_urlsafe(32)
    app = FastAPI()

    # ---- セッション Cookie 方式: 状態はサーバー（sessions 表）に持ち、Cookie には乱数の ID だけ ----
    @app.post("/session/login")
    def session_login(c: Creds, response: Response) -> dict[str, str]:
        uid = check_password(db, c.username, c.password)
        if uid is None:
            raise HTTPException(401, "invalid credentials")
        token = secrets.token_urlsafe(32)
        db.execute("INSERT INTO sessions VALUES (?, ?, ?)", (token, uid, now() + SESSION_TTL))
        db.commit()
        response.set_cookie(COOKIE, token, httponly=True, samesite="lax", max_age=SESSION_TTL)  # 本番なら secure=True も
        return {"status": "ok"}

    def session_user(session_id: str | None = Cookie(default=None)) -> str:
        row = db.execute(
            "SELECT u.username, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?",
            (session_id,),
        ).fetchone() if session_id else None
        if row is None or row["expires_at"] <= now():
            raise HTTPException(401, "not logged in")
        return str(row["username"])

    @app.get("/session/me")
    def session_me(user: str = Depends(session_user)) -> dict[str, str]:
        return {"user": user}

    @app.post("/session/logout")
    def session_logout(response: Response, session_id: str | None = Cookie(default=None)) -> dict[str, str]:
        db.execute("DELETE FROM sessions WHERE token = ?", (session_id,))  # サーバー側で消す = すぐ無効
        db.commit()
        response.delete_cookie(COOKIE)
        return {"status": "ok"}

    # ---- JWT 方式: 状態はトークンの中（署名つき）。サーバーは何も覚えない ----
    @app.post("/jwt/login")
    def jwt_login(c: Creds) -> dict[str, str]:
        uid = check_password(db, c.username, c.password)
        if uid is None:
            raise HTTPException(401, "invalid credentials")
        t = int(now())
        token = jwt.encode({"sub": c.username, "iat": t, "exp": t + JWT_TTL}, secret, algorithm=JWT_ALG)
        return {"access_token": token, "token_type": "bearer"}

    def jwt_user(authorization: str | None = Header(default=None)) -> str:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(401, "not logged in")
        try:
            data = jwt.decode(
                authorization[7:], secret, algorithms=[JWT_ALG],  # アルゴリズムを固定（alg=none を許さない）
                options={"require": ["exp", "sub"], "verify_exp": False, "verify_iat": False}  # 時計は now で差し替えるので PyJWT の時刻判定は切る,
            )
        except jwt.PyJWTError:
            raise HTTPException(401, "invalid token") from None
        if data["exp"] <= now():  # now を差し替えられるよう、期限は自分で比べる
            raise HTTPException(401, "token expired")
        return str(data["sub"])

    @app.get("/jwt/me")
    def jwt_me(user: str = Depends(jwt_user)) -> dict[str, str]:
        return {"user": user}

    app.state.db = db
    return app
