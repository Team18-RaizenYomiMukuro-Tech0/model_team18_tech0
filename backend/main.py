# main.py — チームの API（土台と、接続確認の窓口）
# 起動：uvicorn main:app --reload --no-access-log   （標準のアクセスログは IP を出すので止める。設計.md N-13）
import os
from typing import Annotated

from dotenv import load_dotenv
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

import logging_setup
from db import Db, get_db

load_dotenv()

app = FastAPI(title="Team18 API")
logging_setup.install(app)  # 時刻・API・結果だけのログ（N-13）

# 画面（http://localhost:3000）から呼べるようにする。許可する URL は .env の CORS_ORIGINS
origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET"], allow_headers=["*"])


@app.get("/api/health")
def health(db: Annotated[Db, Depends(get_db)]) -> dict[str, object]:
    """DB につながっているかの確認。DB 名とテーブル数を返す"""
    row = db.fetch_all(
        "SELECT DATABASE() AS db, COUNT(*) AS tables "
        "FROM information_schema.tables WHERE table_schema = DATABASE()"
    )[0]
    return {"status": "ok", "db": row["db"], "tables": row["tables"]}
