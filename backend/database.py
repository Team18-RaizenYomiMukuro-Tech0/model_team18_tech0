# database.py — 班の DB（Azure Database for MySQL）につなぐ
# 接続情報は .env から読む。コードには書かない。
import os

import pymysql
from dotenv import load_dotenv

load_dotenv()  # 同じフォルダの .env を読む


def get_connection():
    """班の DB への接続を 1 つ作って返す"""
    required = ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"]
    missing = [k for k in required if not os.environ.get(k)]
    if missing:
        raise EnvironmentError(f".env に設定がありません: {', '.join(missing)}")

    # Azure は暗号化（SSL）しない接続を断る。証明書があれば相手も確かめる
    ssl = {"ca": os.environ["DB_SSL_CA"]} if os.environ.get("DB_SSL_CA") else {"ssl_disabled": False}

    return pymysql.connect(
        host=os.environ["DB_HOST"],
        port=int(os.environ.get("DB_PORT", "3306")),
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
        database=os.environ["DB_NAME"],
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,  # 行を {列名: 値} で受け取る
        connect_timeout=10,
        ssl=ssl,
    )


def fetch_all(query: str, params: tuple = ()) -> list[dict]:
    """SELECT を実行して、行を dict のリストで返す。値は %s と params で渡す"""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(query, params)
            return cur.fetchall()
    finally:
        conn.close()
