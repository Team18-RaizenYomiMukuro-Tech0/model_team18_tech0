# backend — テストの実行方法

```bash
cd backend
python3 -m venv .venv-dev        # 初回だけ（requirements-dev.txt を入れた環境で動かす）
source .venv-dev/bin/activate
pip install -r requirements-dev.txt
pytest -q                        # 終了コード 0 なら合格
ruff check . && mypy .           # 静的検査
```

- テストは `backend/tests/`（`pytest.ini` の `testpaths`）。
- テスト用の印（`share_mark.get_test_mark`）の差し替えは `tests/conftest.py` の `test_mark_on`（設計.md N-09 / D-19）。
- 班の DB を読むテスト（`test_*_db.py`）は `backend/.env` の接続情報が無いと飛ばされる（skip）。
