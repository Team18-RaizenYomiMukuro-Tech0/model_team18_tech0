# function_app.py — Azure Functions の入口（FastAPI をそのまま HTTP の入口につなぐ）。main.py は変えない。
# ローカルは今までどおり `uvicorn main:app`（または startup.sh）で動かす。ここは Azure の関数アプリだけが読む。
import azure.functions as func

from main import app as fastapi_app

app = func.AsgiFunctionApp(app=fastapi_app, http_auth_level=func.AuthLevel.ANONYMOUS)
