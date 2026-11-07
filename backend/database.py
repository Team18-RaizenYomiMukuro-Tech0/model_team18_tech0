# database.py — 班の DB（Azure Database for MySQL）につなぐ
# 接続情報は .env から読む。コードには書かない（設計.md N-04）。
# 変数名は設計.md N-04 の案 GIFTIA_DB_*。
import os

import pymysql
from dotenv import load_dotenv

load_dotenv()  # 同じフォルダの .env を読む

REQUIRED = [
    "GIFTIA_DB_HOST",
    "GIFTIA_DB_USER",
    "GIFTIA_DB_PASSWORD",
    "GIFTIA_DB_NAME",
    "GIFTIA_DB_SSL_CA",
]


def _ssl_options() -> dict:
    """証明書とホスト名を必ず検証する SSL の設定を返す。

    証明書が無いときは、検証しない接続に落とさず、接続せずに失敗する。
    エラーの文にはパスの値を出さない（設計.md N-04 の 2）。
    """
    ca = os.environ["GIFTIA_DB_SSL_CA"]
    if not os.path.isfile(ca):
        raise EnvironmentError(
            "GIFTIA_DB_SSL_CA のファイルが見つかりません（.env のパスを確かめてください）"
        )
    return {"ca": ca, "check_hostname": True}


def get_connection():
    """班の DB への接続を 1 つ作って返す"""
    missing = [k for k in REQUIRED if not os.environ.get(k)]
    if missing:
        raise EnvironmentError(f".env に設定がありません: {', '.join(missing)}")

    return pymysql.connect(
        host=os.environ["GIFTIA_DB_HOST"],
        port=int(os.environ.get("GIFTIA_DB_PORT", "3306")),
        user=os.environ["GIFTIA_DB_USER"],
        password=os.environ["GIFTIA_DB_PASSWORD"],
        database=os.environ["GIFTIA_DB_NAME"],
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,  # 行を {列名: 値} で受け取る
        connect_timeout=10,
        ssl=_ssl_options(),
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
