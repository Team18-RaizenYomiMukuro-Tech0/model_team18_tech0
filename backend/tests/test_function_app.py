# Azure Functions 用のファイル（手順書 1.3）の確認。main.py は変えず、ローカルの uvicorn 起動は今までどおり。
import json
from pathlib import Path

import function_app
import main

BACKEND = Path(__file__).resolve().parent.parent


def test_function_app_wraps_the_fastapi_app() -> None:
    """Functions の入口は main.py の FastAPI をそのままつなぐ（main.py は変えない）"""
    assert vars(function_app)["fastapi_app"] is main.app
    assert type(function_app.app).__name__ == "AsgiFunctionApp"


def test_host_json_has_empty_route_prefix() -> None:
    """routePrefix が空でないと URL の頭に /api が足され、/api/api/health になる"""
    host = json.loads((BACKEND / "host.json").read_text(encoding="utf-8"))
    assert host["extensions"]["http"]["routePrefix"] == ""


def test_funcignore_keeps_secrets_and_tests_out() -> None:
    lines = (BACKEND / ".funcignore").read_text(encoding="utf-8").splitlines()
    for must in (".env", "*.db", "tests/", "requirements-dev.txt"):
        assert must in lines


def test_azure_functions_is_a_requirement() -> None:
    reqs = (BACKEND / "requirements.txt").read_text(encoding="utf-8")
    assert "azure-functions" in reqs
