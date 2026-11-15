# ログインの試作（#136・ADR-005）— main に入れない

手元の SQLite と bcrypt だけ。班の DB `giftia_t501`・`users`・.env・Azure には触れない。本番の評価に入れない。

```
cd experiments/login
python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
pytest -q -s tests      # 完了条件 1〜3
./check_c5.sh           # 完了条件 5
```
比べた文書: `比較_セッションCookieとJWT.md`（完了条件 4）
