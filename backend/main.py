# main.py — チームの API（土台と、接続確認の窓口）
# 起動（手元）：uvicorn main:app --reload --no-access-log   （標準のアクセスログは IP を出すので止める。設計.md N-13）
# 起動（Azure）：backend/startup.sh（同じく --no-access-log）
import os
from typing import Annotated

from dotenv import load_dotenv
from fastapi import Depends, FastAPI

import logging_setup
import publish
from api.candidates import router as candidates_router
from api.product_detail import router as product_detail_router
from api.products import router as products_router
from api.share_links import router as share_links_router
from db import Db, get_db

load_dotenv()

app = FastAPI(title="Team18 API")
logging_setup.install(app)  # 時刻・API・結果だけのログ（N-13）

# 公開版: 全応答に X-Robots-Tag（noindex）、CORS は公開した画面の送信元 1 つだけ（未設定なら許さない。N-07・D-16）。
# 手元の開発では、画面が Next.js の rewrites で /api/* を同じ送信元から呼ぶので、CORS は開けない
publish.install(app, publish.parse_allowed_origin(os.environ.get(publish.ALLOWED_ORIGIN_ENV)))
app.include_router(candidates_router)  # GET /api/candidates（R-01 の候補。D-01）
app.include_router(products_router)  # GET /api/products（R-02 の絞り込み。D-28）
app.include_router(product_detail_router)  # GET /api/products/{product_id}（商品の詳細。D-29）
app.include_router(share_links_router)  # POST /api/share-links（共有リンクの作成。D-05）


@app.get("/api/health")
def health(db: Annotated[Db, Depends(get_db)]) -> dict[str, object]:
    """DB につながっているかの確認。DB 名とテーブル数を返す"""
    row = db.fetch_all(
        "SELECT DATABASE() AS db, COUNT(*) AS tables "
        "FROM information_schema.tables WHERE table_schema = DATABASE()"
    )[0]
    return {"status": "ok", "db": row["db"], "tables": row["tables"]}
