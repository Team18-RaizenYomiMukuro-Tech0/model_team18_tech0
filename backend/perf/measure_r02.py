"""R-02 の速さ（NF-37・NF-38）を測る。標準ライブラリだけ。班の DB につないだ API を、手元の PC から叩く。

使い方（`backend` フォルダで、API を起動してから）:
    python perf/measure_r02.py products          # 絞り込み。条件なし と 送別＋3000to4999 を各 10 回
    python perf/measure_r02.py products-detail   # 詳細。一覧の先頭の商品 1 件を 10 回
    python perf/measure_r02.py products --base http://127.0.0.1:8000

決まり（NF-01 と同じ測り方）:
- 1 回目から 10 回すべてを数える（ウォームアップなし）。
- 要求を送ってから応答（200）を受け取るまでを秒（小数 3 桁）で測り、小さい順に並べ、小さい順の 9 番目を判定の値にする。
- 判定: 絞り込みは 2 秒以内、詳細は 1 秒以内。200 以外・件数が合わない（絞り込みは 12 件）ときは × にする。
- 接続先のホスト名・接続情報は表示しない（--base は手元の API の URL）。
"""

import argparse
import json
import time
import urllib.error
import urllib.request
from urllib.parse import quote

RUNS = 10
LIMIT = {"products": 2.0, "products-detail": 1.0}
CONDITIONS = [
    ("条件なし", ""),
    ("送別＋3000to4999", f"?scene={quote('送別')}&price_band=3000to4999"),
]


def call(url: str) -> tuple[float, int, dict | None]:
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            status, body = r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        status, body = e.code, None
    return time.perf_counter() - t0, status, body


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("kind", choices=sorted(LIMIT))
    ap.add_argument("--base", default="http://127.0.0.1:8000")
    a = ap.parse_args()
    started = time.strftime("%Y-%m-%d %H:%M:%S")
    print(f"実行日時: {started}（{a.kind}）")
    results: list[tuple[str, float, bool]] = []
    if a.kind == "products":
        for label, q in CONDITIONS:
            print(f"[{label}]")
            vals, ok = [], True
            for i in range(1, RUNS + 1):
                sec, status, body = call(f"{a.base}/api/products{q}")
                good = (
                    status == 200
                    and body is not None
                    and body.get("count") == 12
                    and len(body.get("items", [])) == 12
                )
                ok &= good
                vals.append(sec)
                print(
                    f"  {i:2d} 回目: {sec:.3f} 秒 status={status}{'' if good else '  ← 応答が期待と違う'}"
                )
            ordered = sorted(vals)
            print(f"  並べ替え: {', '.join(f'{v:.3f}' for v in ordered)}")
            print(f"  判定の値（小さい順の 9 番目）: {ordered[8]:.3f} 秒")
            results.append((label, ordered[8], ok))
    else:
        _, status, body = call(
            f"{a.base}/api/products"
        )  # 先頭の商品 1 件（測定には数えない）
        if status != 200 or not body or not body.get("items"):
            raise SystemExit(f"商品の一覧が取れない（status={status}）")
        pid = body["items"][0]["product_id"]
        print(f"[詳細 {pid}]")
        vals, ok = [], True
        for i in range(1, RUNS + 1):
            sec, status, body = call(f"{a.base}/api/products/{quote(pid)}")
            good = (
                status == 200 and body is not None and body.get("status") == "available"
            )
            ok &= good
            vals.append(sec)
            print(
                f"  {i:2d} 回目: {sec:.3f} 秒 status={status}{'' if good else '  ← 応答が期待と違う'}"
            )
        ordered = sorted(vals)
        print(f"  並べ替え: {', '.join(f'{v:.3f}' for v in ordered)}")
        print(f"  判定の値（小さい順の 9 番目）: {ordered[8]:.3f} 秒")
        results.append((f"詳細 {pid}", ordered[8], ok))
    limit = LIMIT[a.kind]
    print("---")
    for label, judge, ok in results:
        print(
            f"{label}: 判定の値 {judge:.3f} 秒（目標 {limit:g} 秒以内）→ {'○' if ok and judge <= limit else '×'}"
        )


if __name__ == "__main__":
    main()
