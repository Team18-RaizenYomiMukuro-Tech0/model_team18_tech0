# backend — テストの実行方法

```bash
cd backend
python3 -m venv .venv-dev        # 初回だけ（.venv に pytest は入っていない）
source .venv-dev/bin/activate
pip install -r requirements-dev.txt
pytest -q                        # 終了コード 0 なら合格
ruff check . && mypy .           # 静的検査
```

- テストは `backend/tests/`（`pytest.ini` の `testpaths`）。
- テスト用の印（`share_mark.get_test_mark`）の差し替えは `tests/conftest.py` の `test_mark_on`（設計.md N-09 / D-19）。
- 班の DB を読むテスト（`test_*_db.py`）は `backend/.env` の接続情報が無いと飛ばされる（skip）。接続情報があっても DB につながらない環境では失敗するので、その場合は `GIFTIA_DB_HOST= GIFTIA_DB_USER= GIFTIA_DB_PASSWORD= pytest -q` で飛ばして流す。
