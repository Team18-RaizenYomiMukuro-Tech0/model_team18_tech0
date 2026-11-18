# 偽の API（Kurosu 用。7 個目の演出の手元確認）。DB・本番には触れない。
import json, sys, time, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
LOG = sys.argv[2] if len(sys.argv) > 2 else "/private/tmp/claude-501/s/fake/requests.log"
INIT = {"P-X": 6, "P-Y": 0, "P-Z": 6, "P-W": 6}
NAMES = {"P-X": "X 商品（いいね 6）", "P-Y": "Y 商品（いいね 0）", "P-Z": "Z 商品（いいね 6）", "P-W": "W 商品（いいね 6）"}
state = {"likes": dict(INIT), "mode": "ok", "delay": 0.0, "n_post": 0}
lock = threading.Lock()
def log(s):
    with open(LOG, "a") as f: f.write(f"{time.strftime('%H:%M:%S')} {s}\n")
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _send(self, code, obj=None):
        b = json.dumps(obj).encode() if obj is not None else b""
        self.send_response(code)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers(); self.wfile.write(b)
    def do_OPTIONS(self): self._send(204)
    def do_GET(self):
        p = urlparse(self.path).path
        log(f"GET {p}")
        if p == "/__state": return self._send(200, state)
        if p == "/__reset":
            with lock: state["likes"] = dict(INIT); state["mode"] = "ok"; state["delay"] = 0.0
            return self._send(200, state)
        if p.startswith("/__set/"):  # /__set/P-X/6  /__set/mode/fail  /__set/delay/3
            _, _, k, v = p.split("/")
            with lock:
                if k == "mode": state["mode"] = v
                elif k == "delay": state["delay"] = float(v)
                else: state["likes"][k] = int(v)
            return self._send(200, state)
        if p.startswith("/api/share-links/"):
            items = [{"product_id": k, "status": "available", "name": NAMES[k], "price": 3000 + i * 500, "reason": "確認用の理由（架空）", "like_count": state["likes"][k], "category": "グルメ"} for i, k in enumerate(["P-X", "P-Y", "P-Z"])]
            return self._send(200, {"items": items})
        if p.startswith("/api/products/") and p.endswith("/voices"): return self._send(200, {"voices": []})
        if p.startswith("/api/products/"):
            pid = p.split("/")[3]
            if pid not in NAMES: return self._send(404, {})
            return self._send(200, {"product_id": pid, "name": NAMES[pid], "price": 3000, "category": "グルメ", "rating": 4.5, "review_count": 10, "delivery_days": 2, "wrapping": True, "high_rating": True, "status": "available", "description": "架空の説明", "size": None})
        if p == "/api/products": return self._send(200, {"items": [], "count": 0, "total": 0, "page": 1, "page_size": 12})
        self._send(404, {})
    def do_POST(self):
        p = urlparse(self.path).path
        n = int(self.headers.get("Content-Length", 0)); body = self.rfile.read(n).decode()
        log(f"POST {p} {body}")
        if p.endswith("/likes"):
            if state["delay"]: time.sleep(state["delay"])
            if state["mode"] == "fail": return self._send(500, {"detail": "fail"})
            d = json.loads(body); pid = d["product_id"]
            with lock:
                c = state["likes"][pid]
                if d["on"]: c = min(c + 1, 30)
                else: c = max(c - 1, 0)
                state["likes"][pid] = c; state["n_post"] += 1
            return self._send(200, {"product_id": pid, "like_count": c, "capped": False})
        self._send(200, {})
ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
