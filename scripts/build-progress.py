#!/usr/bin/env python3
"""進捗ページ（progress.html）を作る。標準ライブラリのみ。

GitHub の Issue とマイルストーンを API で読み、担当者ごとの進み具合を HTML 1枚にする。
  - 数えるのは Issue だけ（完了＝閉じた Issue）。PR は Issue にぶら下げて表示するだけで数えない
  - 期限・遅延はマイルストーン（段階）の due_on（日本時間の日付）
  - 担当者欄に出すのは munder/progress-names.json に載っている人（アカウント名 → 表示名）だけ。
    それ以外のアカウントや担当なしの Issue は「担当未定」1枠にまとめる（数えはする）

使い方:
  GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/repo python scripts/build-progress.py --out _site
  python scripts/build-progress.py --out _site --data scripts/testdata/progress-sample.json --today 2026-11-05
API が失敗してもサイト全体の公開を止めないよう、取得失敗のページを書いて 0 で終わる。
"""
import argparse
import datetime as dt
import html
import json
import os
import re
import sys
import urllib.request

JST = dt.timezone(dt.timedelta(hours=9))
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLOSE_RE = re.compile(r"\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+#(\d+)", re.I)
NO_ASSIGNEE = "担当未定"
NO_MILESTONE = "段階なし"


def api_get(repo, path, token):
    items, page = [], 1
    while True:
        sep = "&" if "?" in path else "?"
        req = urllib.request.Request(
            f"https://api.github.com/repos/{repo}/{path}{sep}per_page=100&page={page}",
            headers={"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28",
                     **({"Authorization": f"Bearer {token}"} if token else {})},
        )
        with urllib.request.urlopen(req, timeout=30) as r:
            chunk = json.load(r)
        items += chunk
        if len(chunk) < 100:
            return items
        page += 1


def load_names(path):
    try:
        with open(path, encoding="utf-8") as f:
            return {k: v for k, v in json.load(f).items() if not k.startswith("_")}
    except (OSError, ValueError):
        return {}


def jst_date(iso):
    """'2026-11-06T14:59:59Z' → 日本時間の date。空なら None"""
    if not iso:
        return None
    d = dt.datetime.fromisoformat(iso.replace("Z", "+00:00"))
    return d.astimezone(JST).date()


def build_model(issues, milestones, names, today):
    due = {m["number"]: jst_date(m.get("due_on")) for m in milestones}
    prs = [i for i in issues if "pull_request" in i]
    real = [i for i in issues if "pull_request" not in i]
    linked = {}
    for p in prs:
        merged = bool((p.get("pull_request") or {}).get("merged_at"))
        if p["state"] == "closed" and not merged:
            continue  # マージされずに閉じた PR は出さない
        for n in set(CLOSE_RE.findall(p.get("body") or "")):
            linked.setdefault(int(n), []).append(
                {"number": p["number"], "title": p["title"], "url": p["html_url"],
                 "state": "merged" if merged else "open"})
    rows = []
    for i in real:
        ms = i.get("milestone")
        d = due.get(ms["number"]) if ms else None
        done = i["state"] == "closed"
        late = (today - d).days if (d and not done and today > d) else 0
        logins = [a["login"] for a in i.get("assignees") or [] if a["login"] in names] or [None]
        rows.append({"number": i["number"], "title": i["title"], "url": i["html_url"], "done": done,
                     "stage": ms["title"] if ms else NO_MILESTONE, "due": d, "late": late,
                     "assignees": logins, "prs": linked.get(i["number"], [])})
    people = {}
    for r in rows:
        for login in r["assignees"]:
            key = login or NO_ASSIGNEE
            p = people.setdefault(key, {"name": names[login] if login else NO_ASSIGNEE,
                                        "login": login, "rows": []})
            p["rows"].append(r)
    order = sorted(people.values(), key=lambda p: (p["login"] is None, p["name"]))
    stages = {}
    for r in rows:
        s = stages.setdefault(r["stage"], {"title": r["stage"], "due": r["due"], "done": 0, "total": 0})
        s["total"] += 1
        s["done"] += r["done"]
    for m in milestones:  # Issue が0件の段階も出す
        stages.setdefault(m["title"], {"title": m["title"], "due": due[m["number"]], "done": 0, "total": 0})
    stage_list = sorted(stages.values(), key=lambda s: (s["due"] is None, s["due"] or today, s["title"]))
    return {"people": order, "stages": stage_list, "total": len(rows), "done": sum(r["done"] for r in rows)}


def pct(done, total):
    return round(done * 100 / total) if total else 0


def e(s):
    return html.escape(str(s), quote=True)


def safe_url(u):
    return u if u.startswith("https://github.com/") else "#"


def due_badge(r):
    if r["done"]:
        return '<span class="st live">完了</span>'
    if not r["due"]:
        return '<span class="st plan">期限未設定</span>'
    if r["late"]:
        return f'<span class="st late">遅延 {r["late"]}日</span>'
    return '<span class="st set">進行中</span>'


def render_row(r):
    prs = "".join(
        f'<a class="pr {x["state"]}" href="{e(safe_url(x["url"]))}">PR #{x["number"]}'
        f'{"（マージ済み）" if x["state"] == "merged" else "（レビュー中）"}</a>' for x in r["prs"])
    due = f'期限 {r["due"].month}/{r["due"].day}' if r["due"] else "期限なし"
    cls = "row done" if r["done"] else "row"
    return (f'<li class="{cls}"><div class="rt"><a href="{e(safe_url(r["url"]))}">#{r["number"]} {e(r["title"])}</a></div>'
            f'<div class="rm">{due_badge(r)}<span class="chip">{e(r["stage"])}</span><span class="chip">{due}</span>{prs}</div></li>')


def render_person(p):
    done = sum(r["done"] for r in p["rows"])
    total = len(p["rows"])
    pc = pct(done, total)
    rows = sorted(p["rows"], key=lambda r: (r["done"], -r["late"], r["number"]))
    return (f'<section class="pcard"><div class="ph"><span class="av" aria-hidden="true">{e(p["name"][:1])}</span>'
            f'<div><h3>{e(p["name"])}</h3>'
            + (f'<p class="lg">{e(p["login"])}</p>' if p["login"] and p["login"] != p["name"] else "")
            + f'</div><div class="num"><b>{pc}%</b><span>完了 {done} ／ 未完了 {total - done}</span></div></div>'
            f'<div class="bar" role="img" aria-label="完了 {pc}%"><i style="width:{pc}%"></i></div>'
            f'<ul class="rows">{"".join(render_row(r) for r in rows)}</ul></section>')


def render_stage(s):
    pc = pct(s["done"], s["total"])
    due = f'期限 {s["due"].month}/{s["due"].day}' if s["due"] else "期限未設定"
    return (f'<li><span class="sn">{e(s["title"])}</span><span class="chip">{due}</span>'
            f'<div class="bar"><i style="width:{pc}%"></i></div><span class="sv">{s["done"]}／{s["total"]}（{pc}%）</span></li>')


CSS = """
.pg{display:grid;grid-template-columns:minmax(0,1fr);gap:var(--s4)}
.sum{display:flex;flex-wrap:wrap;gap:var(--s3)}
.sum div{flex:1 1 140px;background:var(--card);color:var(--ctext);border:var(--bw2) solid var(--line);border-radius:var(--r2);box-shadow:var(--sh1);padding:var(--s3) var(--s4)}
.sum b{display:block;font:800 1.7rem/1.2 var(--body)}.sum span{font-size:var(--fs-s);color:var(--csub)}
.bar{height:12px;border:var(--bw1) solid var(--line);border-radius:var(--rp);background:var(--tint);overflow:hidden}
.bar i{display:block;height:100%;background:var(--m2)}
.pcard,.stg2,.empty{background:var(--card);color:var(--ctext);border:var(--bw2) solid var(--line);border-radius:var(--r2);box-shadow:var(--sh1);padding:var(--s3) var(--s4);display:grid;grid-template-columns:minmax(0,1fr);gap:var(--s3)}
.ph{display:flex;align-items:center;gap:var(--s3)}.ph h3{margin:0;font:800 var(--fs-l)/var(--lh-t) var(--body)}.lg{margin:0;font-size:var(--fs-xs);color:var(--csub)}
.av{display:grid;place-items:center;width:40px;height:40px;border-radius:50%;background:var(--hbg);color:var(--htext);box-shadow:3px 3px 0 var(--hsh);font:800 1rem/1 var(--body);flex:none}
.num{margin-left:auto;text-align:right}.num b{display:block;font:800 1.5rem/1.2 var(--body)}.num span{font-size:var(--fs-xs);color:var(--csub)}
.rows,.stg2 ul{list-style:none;margin:0;padding:0;display:grid;gap:var(--s2)}
.row{border:var(--bw1) solid var(--line);border-radius:var(--r1);padding:var(--s2) var(--s3);background:var(--tint)}.row.done{opacity:.72}
.rt{font-weight:800;font-size:var(--fs-m);overflow-wrap:anywhere}.rm{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;align-items:center}
.chip{border:var(--bw1) solid var(--kac);border-radius:var(--rp);padding:0 10px;font:800 var(--fs-xs)/1.8 var(--body)}
.st.late{background:var(--warn);color:var(--ctext);border:var(--bw1) solid var(--warnbd)}
.st.set{background:var(--m1);color:#12091F;border:var(--bw1) solid var(--line)}
.pr{font-size:var(--fs-xs);font-weight:800}
.stg2 li{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px var(--s3);align-items:center}.stg2 .bar{grid-column:1/-1}.sn{font-weight:800}.sv{font-size:var(--fs-xs);color:var(--csub)}
.sample{display:inline-block;margin-left:var(--s3);padding:0 14px;border:var(--bw2) solid var(--btxt);border-radius:var(--rp);background:var(--m1);color:#12091F;font:800 var(--fs-m)/1.8 var(--body);vertical-align:middle;-webkit-text-stroke:0}.sample-note{margin:var(--s3) 0 0;font-weight:800;font-size:var(--fs-s)}
.note{font-size:var(--fs-s);color:var(--sub)}
@media(max-width:480px){.ph{flex-wrap:wrap}.num{margin-left:0;text-align:left;width:100%}}
"""


def page(body, updated, sample=False):
    return f"""<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>進捗｜雷禅・黄泉・軀</title>
<meta name="description" content="担当者ごとの Issue の進み具合。GitHub の Issue とマイルストーンから自動で作られる。">
<meta name="theme-color" content="#2A1B3D">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@500;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="kb/kb.css">
<style>{CSS}</style>
<script>(function(){{try{{var t=localStorage.getItem("hub-theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}}catch(e){{}}}})();</script>
</head>
<body>
<header class="kb-band"><div class="kb-in">
<div class="kb-nav"><a href="hub.html">← 開発ハブ</a><button id="tg" class="tg" type="button" aria-pressed="false" aria-label="ダークモード" hidden><span class="ic" aria-hidden="true">☀️</span><span>ダークモード</span></button></div>
<h1>進捗{'<span class="sample">サンプル</span>' if sample else ''}</h1>
<p class="lead">担当者ごとの Issue の進み具合。GitHub から自動で作られる。</p>
<ul class="meta"><li>更新: {e(updated)}</li><li>数えるのは Issue だけ</li></ul>
{'<p class="sample-note">ダミーデータの表示例です。実際の Issue ではありません。</p>' if sample else ''}
</div></header>
<main class="kb"><div class="pg">
{body}
<p class="note">数え方: 完了＝閉じた Issue。PR は Issue にぶら下げて出すだけで数えない（PR 本文の「Closes #番号」でひも付く）。期限・遅延は段階（マイルストーン）の期限。更新: main へのマージ時・Issue を閉じた／開いたとき・毎朝1回（日本時間）。</p>
</div></main>
<script src="kb/kb.js" defer></script>
</body>
</html>
"""


def render(model, updated, sample=False):
    if not model["total"] and not model["stages"]:
        body = ('<div class="empty"><h3>まだ Issue がありません</h3>'
                '<p>Issue に担当者とマイルストーン（段階）を付けて立てると、ここに担当者ごとの進み具合が出ます。</p></div>')
        return page(body, updated, sample)
    pc = pct(model["done"], model["total"])
    late = sum(1 for p in model["people"] for r in p["rows"] if r["late"])
    parts = [f'<div class="sum"><div><b>{pc}%</b><span>全体の完了</span></div>'
             f'<div><b>{model["done"]}</b><span>完了</span></div>'
             f'<div><b>{model["total"] - model["done"]}</b><span>未完了</span></div>'
             f'<div><b>{late}</b><span>遅れている</span></div></div>']
    if model["stages"]:
        parts.append('<section class="stg2"><h3 style="margin:0">段階ごと</h3><ul>'
                     + "".join(render_stage(s) for s in model["stages"]) + "</ul></section>")
    if model["total"]:
        parts += [render_person(p) for p in model["people"]]
    else:
        parts.append('<div class="empty"><h3>まだ Issue がありません</h3><p>段階（マイルストーン）だけ作られています。</p></div>')
    return page("\n".join(parts), updated, sample)


def error_page(msg, updated):
    body = (f'<div class="empty"><h3>今回は取得できませんでした</h3><p>GitHub から Issue を読めませんでした（{e(msg)}）。'
            '次の更新でもう一度試します。</p></div>')
    return page(body, updated)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--data", help="API の代わりに読む JSON（確認用）")
    ap.add_argument("--names", default=os.path.join(ROOT, "munder", "progress-names.json"))
    ap.add_argument("--today", help="YYYY-MM-DD（確認用）")
    a = ap.parse_args()
    now = dt.datetime.now(JST)
    today = dt.date.fromisoformat(a.today) if a.today else now.date()
    updated = f"{today.isoformat()} {now.strftime('%H:%M')} JST" if not a.today else today.isoformat()
    os.makedirs(a.out, exist_ok=True)
    out = os.path.join(a.out, "progress.html")
    try:
        if a.data:
            with open(a.data, encoding="utf-8") as f:
                d = json.load(f)
            issues, milestones = d["issues"], d["milestones"]
        else:
            repo = os.environ["GITHUB_REPOSITORY"]
            token = os.environ.get("GITHUB_TOKEN")
            issues = api_get(repo, "issues?state=all", token)
            milestones = api_get(repo, "milestones?state=all", token)
        text = render(build_model(issues, milestones, load_names(a.names), today), updated, sample=bool(a.data))
    except Exception as ex:  # 公開全体を止めない
        print(f"warning: 進捗を作れませんでした: {type(ex).__name__}", file=sys.stderr)
        text = error_page(type(ex).__name__, updated)
    with open(out, "w", encoding="utf-8") as f:
        f.write(text)
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
