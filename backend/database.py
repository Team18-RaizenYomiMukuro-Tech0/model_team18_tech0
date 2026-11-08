# database.py — 班の DB（Azure Database for MySQL）への接続を作る
# 接続情報（ホスト・ユーザー・パスワード）は .env（環境変数）から読む。コードには書かない（設計.md N-04）。
# 問い合わせは db.py の Db を通す。ここでは接続を作るだけ。
import os
from typing import Any

import certifi
import pymysql  # type: ignore[import-untyped]  # PyMySQL は型情報を配っていないため
import pymysql.cursors  # type: ignore[import-untyped]  # 同上
from dotenv import load_dotenv

load_dotenv()  # 同じフォルダの .env を読む

# 接続先は giftia_t501 に固定する。環境変数では受けない（#70-2・#71-1、設計.md N-04 の 3）。
# 配られたアカウントは t502〜t506 にも書けるので、ほかの班の DB にはつながない。
DB_NAME = "giftia_t501"

REQUIRED = [
    "GIFTIA_DB_HOST",
    "GIFTIA_DB_USER",
    "GIFTIA_DB_PASSWORD",
]


def _ssl_options() -> dict[str, Any]:
    """certifi の公開の証明書の束で、証明書とホスト名を必ず確かめる SSL の設定（案Q。#71-2）。

    検証を切る設定は作らない。証明書のファイルも環境変数も使わない。
    """
    return {"ca": certifi.where(), "check_hostname": True}


def get_connection() -> Any:
    """班の DB への接続を 1 つ作って返す"""
    missing = [k for k in REQUIRED if not os.environ.get(k)]
    if missing:
        raise OSError(f".env に設定がありません: {', '.join(missing)}")

    return pymysql.connect(
        host=os.environ["GIFTIA_DB_HOST"],
        port=int(os.environ.get("GIFTIA_DB_PORT", "3306")),
        user=os.environ["GIFTIA_DB_USER"],
        password=os.environ["GIFTIA_DB_PASSWORD"],
        database=DB_NAME,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,  # 行を {列名: 値} で受け取る
        connect_timeout=10,
        ssl=_ssl_options(),
    )


def fetch_all(query: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    """SELECT を実行して、行を dict のリストで返す。値は %s と params で渡す（実行は Db を通す）"""
    import db  # db.py は get_connection を使うので、循環を避けて呼ぶ時に読む

    return db.fetch_all(query, params)
