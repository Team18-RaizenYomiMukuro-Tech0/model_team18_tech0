# main.py — チームの API（まずは接続確認の窓口だけ）
# 起動：uvicorn main:app --reload
import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import fetch_all

load_dotenv()

app = FastAPI(title="Team18 API")

# 画面（http://localhost:3000）から呼べるようにする。許可する URL は .env の CORS_ORIGINS
origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET"], allow_headers=["*"])


@app.get("/api/health")
def health():
    """DB につながっているかの確認。DB 名とテーブル数を返す"""
    row = fetch_all(
        "SELECT DATABASE() AS db, COUNT(*) AS tables "
        "FROM information_schema.tables WHERE table_schema = DATABASE()"
    )[0]
    return {"status": "ok", "db": row["db"], "tables": row["tables"]}
