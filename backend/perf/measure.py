# measure.py — 速さの測定（Issue #67 T3、設計.md N-03・D-17、テスト設計 NF-01〜03・NF-36）
# アプリの外から、HTTP で 3 つの API を各 10 回呼んで経過時間を測る（1 回目も数える）。
# 判定の値は「小さい順に並べた 9 番目」（遅い方から 2 番目）。基準: 候補 2 秒・作成 1 秒・取得 1 秒。
#
#   python backend/perf/measure.py candidates                   # 送別・3,000〜4,999円（NF-01）
#   python backend/perf/measure.py candidates --no-price-band   # 送別・価格帯なし（NF-36）
#   python backend/perf/measure.py create                       # 商品 10 件で作成（NF-02）
#   python backend/perf/measure.py get                          # 商品 10 件のリンクを開く（NF-03）
#
# 出力は evidence/NF-01〜03.md・NF-36.md に貼れる Markdown（標準出力）。接続先・接続情報は出さない。
# 作る行の is_test=1 の印は、アプリの外（このスクリプト）が dependency_overrides で付ける（設計.md N-09、tests の
# test_mark_on と同じ方法）。API はこのスクリプトが手元で起動する（127.0.0.1 の空きポート）ので、別に起動しなくてよい。
# アプリの中に計測用の入口・ログは作らない。
from __future__ import annotations

import argparse
import json
import socket
import sys
import threading
import time
import urllib.error
import urllib.request
from collections.abc import Callable
from datetime import datetime
from pathlib import Path
from typing import Any

BACKEND = Path(__file__).resolve().parent.parent
RUNS = 10
JUDGE_INDEX = 8  # 小さい順の 9 番目（0 始まりで 8）= 遅い方から 2 番目
REQUEST_TIMEOUT = 15.0  # アプリ側の打ち切り（10 秒）より長く待つ

CANDIDATES_BAND = "/api/candidates?scene=%E9%80%81%E5%88%A5&price_band=3000to4999"  # 送別・3,000〜4,999円
CANDIDATES_NO_BAND = "/api/candidates?scene=%E9%80%81%E5%88%A5"  # 送別・価格帯なし

# 測る対象: 表題・証拠ファイル・基準（秒）・期待する状態コード・条件の説明
TARGETS: dict[str, dict[str, Any]] = {
    "candidates": {
        "title": "候補取得 GET /api/candidates（送別・価格帯 3,000〜4,999円）",
        "evidence": "NF-01.md",
        "limit": 2.0,
        "status": 200,
    },
    "candidates-no-band": {
        "title": "候補取得 GET /api/candidates（送別・価格帯なし）",
        "evidence": "NF-36.md",
        "limit": 2.0,
        "status": 200,
    },
    "create": {
        "title": "共有リンク作成 POST /api/share-links（商品 10 件）",
        "evidence": "NF-02.md",
        "limit": 1.0,
        "status": 201,
    },
    "get": {
        "title": "共有リンク取得 GET /api/share-links/{id}（商品 10 件のリンク）",
        "evidence": "NF-03.md",
        "limit": 1.0,
        "status": 200,
    },
}


# ---- 集計・判定（単体テストの対象。実 API・DB には繋がない）----


def sort_values(values: list[float]) -> list[float]:
    """小さい順に並べる"""
    return sorted(values)


def judge_value(values: list[float]) -> float:
    """判定の値 = 小さい順の 9 番目（遅い方から 2 番目）。10 回そろっていなければ ValueError"""
    if len(values) != RUNS:
        raise ValueError(f"{RUNS} 回の値が要ります（{len(values)} 回）")
    return sort_values(values)[JUDGE_INDEX]


def seconds_text(value: float) -> str:
    """秒、小数 3 桁"""
    return f"{value:.3f}"


def is_within(value: float, limit: float) -> bool:
    """基準以内か。小数 3 桁に丸めた値で比べる（証拠に書く値と判定をそろえる）"""
    return round(value, 3) <= limit


def mark(ok: bool) -> str:
    return "○" if ok else "×"


def render_markdown(
    name: str, values: list[float], statuses: list[int], when: datetime, runner: str = ""
) -> str:
    """証拠（evidence/NF-xx.md）に貼れる Markdown。応答の状態コードが期待と違う回があれば × にする"""
    t = TARGETS[name]
    ordered = sort_values(values)
    judge = judge_value(values)
    all_ok_status = all(s == t["status"] for s in statuses)
    ok = is_within(judge, t["limit"]) and all_ok_status
    lines = [
        f"### {t['title']}",
        "",
        f"- 実行日時: {when.strftime('%Y-%m-%d %H:%M:%S')}",
        f"- 測定スクリプト: `backend/perf/measure.py`（`{runner or name}`）",
        "- 条件: 手元の PC から班の DB につなぐ（接続先のホスト名・接続情報は書かない）。1 回目から 10 回すべてを数える",
        "- 実行 PC と回線の様子: （だーあさが記入）",
        "",
        "| 回 | 経過時間（秒） | 応答 |",
        "| ---: | ---: | ---: |",
    ]
    for i, (v, s) in enumerate(zip(values, statuses, strict=True), start=1):
        lines.append(f"| {i} | {seconds_text(v)} | {s} |")
    lines += [
        "",
        f"- 小さい順: {', '.join(seconds_text(v) for v in ordered)}",
        f"- 判定の値（小さい順の 9 番目）: {seconds_text(judge)} 秒",
        f"- 基準: {t['limit']:g} 秒以内（応答は {t['status']}）",
        f"- 判定: {mark(ok)}" + ("" if all_ok_status else "（応答の状態コードが期待と違う回あり）"),
        "",
    ]
    return "\n".join(lines)


# ---- HTTP（標準ライブラリだけ）----


def timed_request(base: str, method: str, path: str, body: dict[str, Any] | None = None) -> tuple[float, int, bytes]:
    """要求を送ってから応答の本文を受け取り終わるまでの経過時間（秒）、状態コード、本文"""
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(base + path, data=data, method=method)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    start = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:  # noqa: S310  127.0.0.1 か指定先のみ
            payload = resp.read()
            status = resp.status
    except urllib.error.HTTPError as ex:
        payload = ex.read()
        status = ex.code
    return time.perf_counter() - start, status, payload


def measure(run_once: Callable[[], tuple[float, int]]) -> tuple[list[float], list[int]]:
    """run_once を 10 回呼ぶ。1 回目から数える"""
    values: list[float] = []
    statuses: list[int] = []
    for _ in range(RUNS):
        elapsed, status = run_once()
        values.append(elapsed)
        statuses.append(status)
    return values, statuses


# ---- 手元で API を起動する（印 is_test=1 をアプリの外から付けるため）----


class LocalApi:
    """backend の main.app を 127.0.0.1 の空きポートで起動する。with で使う"""

    def __init__(self) -> None:
        self.base = ""
        self._server: Any = None
        self._thread: threading.Thread | None = None

    def __enter__(self) -> LocalApi:
        if str(BACKEND) not in sys.path:
            sys.path.insert(0, str(BACKEND))
        import uvicorn

        import main
        from share_mark import get_test_mark

        main.app.dependency_overrides[get_test_mark] = lambda: 1  # 作る行に印（is_test=1）を付ける
        with socket.socket() as s:
            s.bind(("127.0.0.1", 0))
            port = s.getsockname()[1]
        config = uvicorn.Config(main.app, host="127.0.0.1", port=port, log_level="warning", access_log=False)
        self._server = uvicorn.Server(config)
        self._thread = threading.Thread(target=self._server.run, daemon=True)
        self._thread.start()
        for _ in range(100):
            if self._server.started:
                break
            time.sleep(0.1)
        else:
            raise RuntimeError("API が起動しませんでした")
        self.base = f"http://127.0.0.1:{port}"
        return self

    def __exit__(self, *exc: object) -> None:
        if self._server is not None:
            self._server.should_exit = True
        if self._thread is not None:
            self._thread.join(timeout=5)
        import main
        from share_mark import get_test_mark

        main.app.dependency_overrides.pop(get_test_mark, None)


def pick_product_ids(base: str) -> list[str]:
    """商品 10 件（送別・3,000〜4,999円の候補の上位 10 件。測る回数には入れない）"""
    _, status, payload = timed_request(base, "GET", CANDIDATES_BAND)
    if status != 200:
        raise RuntimeError(f"商品を選べませんでした（候補取得が {status}）")
    ids = [str(i["product_id"]) for i in json.loads(payload)["items"]]
    if len(ids) < 10:
        raise RuntimeError(f"商品が 10 件そろいません（{len(ids)} 件）")
    return ids[:10]


def run_target(name: str, base: str) -> tuple[list[float], list[int]]:
    if name == "candidates":
        return measure(lambda: timed_request(base, "GET", CANDIDATES_BAND)[:2])
    if name == "candidates-no-band":
        return measure(lambda: timed_request(base, "GET", CANDIDATES_NO_BAND)[:2])
    ids = pick_product_ids(base)
    if name == "create":
        return measure(lambda: timed_request(base, "POST", "/api/share-links", {"product_ids": ids})[:2])
    # get: 10 件のリンクを 1 本作ってから（測らない）、開くのを 10 回測る
    _, status, payload = timed_request(base, "POST", "/api/share-links", {"product_ids": ids})
    if status != 201:
        raise RuntimeError(f"リンクを作れませんでした（作成が {status}）")
    path = f"/api/share-links/{json.loads(payload)['share_id']}"
    return measure(lambda: timed_request(base, "GET", path)[:2])


def main_cli(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="API の速さを 10 回測る（Issue #67）")
    p.add_argument("target", choices=["candidates", "create", "get"])
    p.add_argument("--no-price-band", action="store_true", help="candidates で price_band を付けない（NF-36）")
    p.add_argument("--base-url", help="candidates だけ。起動済みの API を測る（既定は手元で起動する）")
    args = p.parse_args(argv)
    if args.no_price_band and args.target != "candidates":
        p.error("--no-price-band は candidates だけで使えます")
    if args.base_url and args.target != "candidates":
        p.error("--base-url は candidates だけで使えます（作る行の印を付けるため、作成・取得は手元で起動します）")
    name = "candidates-no-band" if args.no_price_band else args.target
    runner = args.target + (" --no-price-band" if args.no_price_band else "")
    if args.base_url:
        values, statuses = run_target(name, args.base_url.rstrip("/"))
    else:
        with LocalApi() as api:
            values, statuses = run_target(name, api.base)
    print(render_markdown(name, values, statuses, datetime.now(), runner))
    return 0


if __name__ == "__main__":
    sys.exit(main_cli())
