#!/usr/bin/env python3
"""進捗ページ（progress.html）を作る。標準ライブラリのみ。

GitHub の Issue とマイルストーンを API で読み、担当者ごとの進み具合を HTML 1枚にする。
  - 数えるのは Issue だけ（完了＝閉じた Issue）。PR は Issue にぶら下げて表示するだけで数えない
  - 期限・遅延はマイルストーン（段階）の due_on（日本時間の日付）
  - 未完了の Issue の状態は3つ: 未着手（つながる PR なし）／作業中（Draft の PR あり）／レビュー待ち（Ready の PR あり）。
    つながりは PR 本文の「Closes #n」（CLOSE_RE）で判定
  - 一番上に「🔥 いま動くこと」: ⚠ 遅れ・⏰ 期限が近い（期限の2日前以内）の Issue、👀 レビュー待ちの PR（Ready）、
    ✅ マージ済みなのに Issue が開いたまま（閉じるだけ）。0件なら「いま急ぐものはありません 🎉」
  - 並びは いま動くこと → 担当者カード → 段階ごと → 直近マージ済み PR
  - 上部の名前ボタンで担当者ごとに絞れる（#名前 で開くと最初から絞れる）
  - 開いた Issue にひも付く PR がマージ済みなら「マージ済み・Issue 未完了」（PM 未決事項 #71 の暫定。数えるのは Issue だけなので未完了のまま）
  - 担当者カードは畳んだ「内訳」つき。領域別の件数は Issue 題の頭文字 [P*][B*][F*][T*] から
  - 一番下に直近マージ済み PR 10件の表（担当者の列見出しで並べ替え）
  - 同じデータから progress-summary.json も書く（ハブの進捗カード用。表示名だけで、アカウント名・メールは入れない）。
    取得に失敗したときは {"updatedAt", "error"} だけを書く
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
SOON_DAYS = 2  # 期限の何日前から「近い」にするか
RECENT_PRS = 10
OTHER = "その他"  # 表示名の対応表に無い PR 作者
AREA_RE = re.compile(r"^\s*\[([PBFT])\d+\]")
AREAS = {"P": "PM", "B": "DB・API", "F": "画面", "T": "テスト"}  # Issue 題の頭文字 → 領域
# 題の頭の [B2] → 分野の札。AREA_RE と違い番号まで取り、残りの題名を返す
AREA_TITLE_RE = re.compile(r"^\s*\[([PBFT]\d+)\]\s*(.*)$", re.S)
# 段階の技の名前（ハブの霊力ゲージと同じ。マイルストーン題の頭の数字で決まる）
WAZA = {"1": "霊気", "2": "霊丸", "3": "霊光波動", "4": "魔族覚醒"}


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
                 "state": "merged" if merged else ("draft" if p.get("draft") else "open")})
    rows = []
    for i in real:
        ms = i.get("milestone")
        d = due.get(ms["number"]) if ms else None
        done = i["state"] == "closed"
        late = (today - d).days if (d and not done and today > d) else 0
        left = (d - today).days if (d and not done and today <= d) else None
        prs_of = linked.get(i["number"], [])
        status = ("done" if done else "merged" if any(x["state"] == "merged" for x in prs_of)
                  else "review" if any(x["state"] == "open" for x in prs_of)
                  else "wip" if any(x["state"] == "draft" for x in prs_of) else "todo")
        am = AREA_RE.match(i["title"])
        logins = [a["login"] for a in i.get("assignees") or [] if a["login"] in names] or [None]
        rows.append({"number": i["number"], "title": i["title"], "url": i["html_url"], "done": done,
                     "stage": ms["title"] if ms else NO_MILESTONE, "due": d, "late": late, "left": left,
                     "status": status, "area": am.group(1) if am else None,
                     "assignees": logins, "prs": prs_of})
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
        s = stages.setdefault(r["stage"], {"title": r["stage"], "due": r["due"], "done": 0, "total": 0, "rows": []})
        s["rows"].append(r)
        s["total"] += 1
        s["done"] += r["done"]
    for m in milestones:  # Issue が0件の段階も出す
        stages.setdefault(m["title"], {"title": m["title"], "due": due[m["number"]], "done": 0, "total": 0, "rows": []})
    stage_list = sorted(stages.values(), key=lambda s: (s["due"] is None, s["due"] or today, s["title"]))
    prev = None
    for s in stage_list:  # 期間: 前の段階の翌日〜期限
        s["start"] = prev + dt.timedelta(days=1) if (prev and s["due"]) else None
        s["left"] = (s["due"] - today).days if s["due"] else None
        if s["due"]:
            prev = s["due"]
    open_rows = [r for r in rows if not r["done"]]
    alerts = sorted((r for r in open_rows if r["late"] or (r["left"] is not None and r["left"] <= SOON_DAYS)),
                    key=lambda r: (r["due"], r["number"]))
    counts = {k: sum(1 for r in open_rows if r["status"] == k) for k in ("todo", "wip", "review", "merged")}
    # 今日（JST）の動き: マージされた PR 数・閉じた Issue 数（上限なしで数える）
    # gain = 今日ゲージが進んだ Issue の数: 今日閉じた Issue ＋ 今日マージされた PR が Closes で結ぶ未完了 Issue（同じ Issue は1回）。Issue に結ばない PR は数えない
    closed_today = {i["number"] for i in real if i["state"] == "closed" and jst_date(i.get("closed_at")) == today}
    open_nums = {i["number"] for i in real if i["state"] != "closed"}
    linked_today = {int(n) for p in prs if jst_date((p.get("pull_request") or {}).get("merged_at")) == today
                    for n in CLOSE_RE.findall(p.get("body") or "")}
    gain = len(closed_today | (linked_today & open_nums))
    today_counts = {"gain": gain, "merged": sum(1 for p in prs if jst_date((p.get("pull_request") or {}).get("merged_at")) == today),
                    "closed": sum(1 for i in real if i["state"] == "closed" and jst_date(i.get("closed_at")) == today)}
    merged_prs = []
    for p in prs:
        t = (p.get("pull_request") or {}).get("merged_at")
        if t:
            u = (p.get("user") or {}).get("login")
            when = dt.datetime.fromisoformat(t.replace("Z", "+00:00")).astimezone(JST)
            merged_prs.append({"number": p["number"], "title": p["title"], "url": p["html_url"],
                               "author": names.get(u, OTHER), "at": when,
                               "who": u.lower() if u in names else "none"})
    review_prs = []
    for p in prs:
        if p["state"] == "open" and not p.get("draft"):
            u = (p.get("user") or {}).get("login")
            review_prs.append({"number": p["number"], "title": p["title"], "url": p["html_url"],
                               "author": names.get(u, OTHER), "who": u.lower() if u in names else "none"})
    review_prs.sort(key=lambda x: x["number"], reverse=True)
    merged_prs.sort(key=lambda x: (x["at"], x["number"]), reverse=True)
    # 表に入れる行: 全体の最近10件 + 各メンバーの最近10件（重複は1行）。top=全体の最近10件に入る行
    pool = {}
    for x in merged_prs[:RECENT_PRS]:
        pool[x["number"]] = dict(x, top=True)
    for w in [m.lower() for m in names] + ["none"]:
        for x in [y for y in merged_prs if y["who"] == w][:RECENT_PRS]:
            pool.setdefault(x["number"], dict(x, top=False))
    merged_pool = sorted(pool.values(), key=lambda x: (x["at"], x["number"]), reverse=True)
    merged_prs = merged_prs[:RECENT_PRS]
    members = [{"id": k.lower(), "name": v} for k, v in names.items()]
    for p in order:
        p["id"] = p["login"].lower() if p["login"] else "none"
    return {"people": order, "stages": stage_list, "total": len(rows), "done": sum(r["done"] for r in rows),
            "alerts": alerts, "counts": counts, "members": members, "merged_prs": merged_prs, "merged_pool": merged_pool, "today_counts": today_counts, "review_prs": review_prs,
            "name_of": {k: v for k, v in names.items()}}


def pct(done, total):
    return round(done * 100 / total) if total else 0


def e(s):
    return html.escape(str(s), quote=True)


def safe_url(u):
    return u if u.startswith("https://github.com/") else "#"


STATUS = {"done": ("live", "完了"), "todo": ("plan", "未着手"), "wip": ("set", "作業中"), "review": ("live", "レビュー待ち"),
          "merged": ("merged", "マージ済み・Issue 未完了")}


def due_badge(r):
    """期限の警告札。期限切れ（遅延）と、期限の2日前以内だけ出る"""
    if r["done"] or not r["due"]:
        return ""
    if r["late"]:
        return f'<span class="st late">遅延 {r["late"]}日</span>'
    if r["left"] is not None and r["left"] <= SOON_DAYS:
        left = r["left"]
        return f'<span class="st soon">{"今日が期限" if left == 0 else "期限まであと %d日" % left}</span>'
    return ""


def title_parts(title, badge):
    """分野の札にするとき（badge）は (札の HTML, 残りの題名)。頭に [P1] などが無ければ札なしで題名そのまま"""
    m = AREA_TITLE_RE.match(title) if badge else None
    if not m:
        return "", title
    return f'<span class="ar ar-{m.group(1)[0]}">{m.group(1)}</span>', m.group(2)


def render_row(r, who=None, mark="", extra="", badge=False):
    prs = "".join(
        f'<a class="pr {x["state"]}" href="{e(safe_url(x["url"]))}">PR #{x["number"]}'
        f'{"（マージ済み）" if x["state"] == "merged" else "（作業中）" if x["state"] == "draft" else "（レビュー待ち）"}</a>'
        for x in r["prs"])
    due = f'期限 {r["due"].month}/{r["due"].day}' if r["due"] else "期限なし"
    cls = "row done" if r["done"] else "row"
    k, label = STATUS[r["status"]]
    unset = '<span class="st plan">期限未設定</span>' if (not r["done"] and not r["due"]) else ""
    names = "".join(f'<span class="chip">{e(n)}</span>' for n in (who or []))
    ids = " ".join(a.lower() if a else "none" for a in r["assignees"])
    ab, ttl = title_parts(r["title"], badge)
    return (f'<li class="{cls}" data-who="{e(ids)}"><div class="rt">{mark}{ab}<a href="{e(safe_url(r["url"]))}">#{r["number"]} {e(ttl)}</a></div>'
            f'<div class="rm"><span class="st {k}">{label}</span>{due_badge(r)}{unset}{names}{extra}'
            f'<span class="chip">{e(r["stage"])}</span><span class="chip">{due}</span>{prs}</div></li>')


SB = {"todo": "gray", "wip": "blue", "review": "blue", "merged": "green", "done": "green"}


def due_order(r):
    """内訳の並び: 遅れ → 今日が期限 → 期限の早い順 → 期限なし。同じ期限は Issue 番号順。完了は最後"""
    return (r["done"], r["due"] is None, r["due"] or dt.date.min, r["number"])


def render_stage_row(r, who, stage=None):
    """段階の内訳の1件: 題名（普通の太さ）＋状態の札だけ色つき。担当と期限は小さい灰色の文字"""
    k, label = STATUS[r["status"]]
    late = f'<span class="sb red">遅れ {r["late"]}日</span>' if (not r["done"] and r["due"] and r["late"]) else ""
    due = f'期限 {r["due"].month}/{r["due"].day}' if r["due"] else "期限なし"
    soon = ""
    if not r["done"] and r["due"] and not r["late"] and r["left"] is not None and r["left"] <= SOON_DAYS:
        soon = "（今日が期限）" if r["left"] == 0 else f"（あと{r['left']}日）"
    prs = "".join(
        f'<a class="pr {x["state"]}" href="{e(safe_url(x["url"]))}">PR #{x["number"]}'
        f'{"（マージ済み）" if x["state"] == "merged" else "（作業中）" if x["state"] == "draft" else "（レビュー待ち）"}</a>'
        for x in r["prs"])
    ids = " ".join(a.lower() if a else "none" for a in r["assignees"])
    ab, ttl = title_parts(r["title"], True)
    return (f'<li class="sr" data-who="{e(ids)}">{ab}<a class="stt" href="{e(safe_url(r["url"]))}">#{r["number"]} {e(ttl)}</a>'
            f'<div class="srm"><span class="sb {SB[r["status"]]}">{label}</span>{late}'
            f'<span class="sd">{e(stage if stage is not None else "、".join(who))}・{due}{soon}</span>{prs}</div></li>')


def render_person(p):
    done = sum(r["done"] for r in p["rows"])
    total = len(p["rows"])
    pc = pct(done, total)
    rows = sorted(p["rows"], key=due_order)
    areas = "".join(
        f'<span class="chip ar ar-{k}">{AREAS[k]} {sum(1 for r in p["rows"] if r["area"] == k and r["done"])}'
        f'／{sum(1 for r in p["rows"] if r["area"] == k)}</span>'
        for k in AREAS if any(r["area"] == k for r in p["rows"]))
    return (f'<section class="pcard" data-who="{e(p["id"])}"><div class="ph"><span class="av" aria-hidden="true">{e(p["name"][:1])}</span>'
            f'<h3>{e(p["name"])}</h3>'
            f'<div class="num"><b>{pc}%</b><span>完了 {done} ／ 未完了 {total - done}</span></div></div>'
            f'<div class="bar" role="img" aria-label="完了 {pc}%"><i style="width:{pc}%"></i></div>'
            + (f'<div class="rm">{areas}</div>' if areas else "")
            + f'<details><summary>内訳を開く（{total}件）</summary><ul class="srows">{"".join(render_stage_row(r, [], stage=r["stage"]) for r in rows)}</ul></details></section>')


def render_prs(prs, members=()):
    """直近マージ済み PR の表。担当者の列見出しで並べ替え（JS はページ内のみ）"""
    if not prs:
        return '<section class="pcard"><h3 style="margin:0">直近マージ済み PR</h3><p class="none">まだありません</p></section>'
    rows = "".join(
        f'<tr data-a="{e(x["author"])}" data-t="{x["at"].isoformat()}" data-who="{e(x.get("who", "none"))}" data-top="{1 if x.get("top", True) else 0}"{"" if x.get("top", True) else " hidden"}>'
        f'<td data-label="PR"><a href="{e(safe_url(x["url"]))}">#{x["number"]}</a></td>'
        f'<td data-label="タイトル">{e(x["title"])}</td><td data-label="担当者">{e(x["author"])}</td>'
        f'<td data-label="マージ日時">{x["at"].strftime("%m/%d %H:%M")}</td></tr>' for x in prs)
    who_row = ('<ul class="meta" id="prwho" aria-label="PR を担当者で絞る">'
               + "".join(f'<li><button type="button" data-id="{e(i)}" aria-pressed="{"true" if i == "" else "false"}" hidden>{e(n)}</button></li>'
                         for i, n in [("", "全員")] + [(m["id"], m["name"]) for m in members] + [("none", OTHER)]) + '</ul>')
    return ('<section class="pcard" id="prs"><h3 style="margin:0">直近マージ済み PR（<span id="prn">%d</span>件）</h3>'
            + who_row + '<div class="sortbar" role="group" aria-label="並べ替え">並べ替え:'
            '<button type="button" data-k="t" aria-pressed="true">マージ日時</button>'
            '<button type="button" data-k="a" aria-pressed="false">担当者</button></div>'
            '<div class="tbl"><table><thead><tr>'
            '<th>PR</th><th>タイトル</th>'
            '<th aria-sort="none"><button type="button" data-k="a">担当者 <span aria-hidden="true">⇅</span></button></th>'
            '<th aria-sort="descending"><button type="button" data-k="t">マージ日時（JST） <span aria-hidden="true">▼</span></button></th>'
            '</tr></thead><tbody>%s</tbody></table></div></section>') % (sum(1 for x in prs if x.get("top", True)), rows)


def md(d):
    return f"{d.month}/{d.day}"


def render_stage(s, name_of):
    pc = pct(s["done"], s["total"])
    if s["due"]:
        period = f"{md(s['start'])}〜{md(s['due'])}" if s["start"] else f"〜{md(s['due'])}"
        if s["total"] and s["done"] == s["total"]:
            left = "完了"
        elif s["left"] > 0:
            left = f"残り {s['left']}日"
        elif s["left"] == 0:
            left = "今日が期限"
        else:
            left = f"期限切れ {-s['left']}日"
    else:
        period, left = "期限未設定", ""
    progress = f'{s["done"]}／{s["total"]}（{pc}%）' if s["total"] else "Issue なし"
    wz = WAZA.get(s["title"][:1]) if s["title"][1:2] == " " else None
    cls = f' class="w{s["title"][0]}"' if wz else ""
    waza = f" <b>{wz}</b>" if wz else ""
    return (f'<li{cls}><span class="sn">{e(s["title"])}{waza}</span><span class="chip">{period}</span>'
            f'<div class="bar"><i style="width:{pc}%"></i></div>'
            f'<span class="sv">{progress}{"　" + left if left else ""}</span>'
            + (f'<details><summary>内訳を開く（{s["total"]}件）</summary><ul class="srows">'
               + "".join(render_stage_row(x, [name_of.get(a, NO_ASSIGNEE) if a else NO_ASSIGNEE for a in x["assignees"]] or [NO_ASSIGNEE])
                         for x in sorted(s["rows"], key=due_order))
               + "</ul></details>" if s["rows"] else "") + "</li>")


CSS = """
.pg{display:grid;grid-template-columns:minmax(0,1fr);gap:var(--s4)}
.sum{display:flex;flex-wrap:wrap;gap:var(--s3)}
.sum div{flex:1 1 140px;background:var(--card);color:var(--ctext);border:var(--bw2) solid var(--line);border-radius:var(--r2);box-shadow:var(--sh1);padding:var(--s3) var(--s4)}
.sum b{display:block;font:800 1.7rem/1.2 var(--body)}.sum span{font-size:var(--fs-s);color:var(--csub)}
.bar{height:12px;border:var(--bw1) solid var(--line);border-radius:var(--rp);background:var(--tint);overflow:hidden}
.bar i{display:block;height:100%;background:var(--m2)}
.pcard,.stg2,.empty{background:var(--card);color:var(--ctext);border:var(--bw2) solid var(--line);border-radius:var(--r2);box-shadow:var(--sh1);padding:var(--s3) var(--s4);display:grid;grid-template-columns:minmax(0,1fr);gap:var(--s3)}
.ph{display:flex;align-items:center;gap:var(--s3)}.ph h3{margin:0;font:800 var(--fs-l)/var(--lh-t) var(--body)}.kb-band{padding-bottom:var(--s4)}.kb-band .kb-nav{margin-bottom:var(--s2)}.upd{margin:2px 0 0;font:800 var(--fs-xs)/1.6 var(--body)}.kb-band .meta{margin-top:var(--s2)}
.allbar{margin:0}.allbar p{margin:0 0 4px;font-weight:800}.allbar span{font-weight:500;color:var(--sub);font-size:var(--fs-s)}
.pgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:var(--s3);align-items:start}
.pcard details>summary{cursor:pointer;font:800 var(--fs-s)/2 var(--body)}.pcard details[open]>summary{margin-bottom:var(--s2)}
.st.merged{background:var(--tint);color:var(--ctext);border:var(--bw1) solid var(--kac)}
#prs .sortbar{display:none;align-items:center;gap:var(--s2);font:800 var(--fs-xs)/1.8 var(--body)}#prs .sortbar button{font:inherit;color:inherit;background:transparent;border:var(--bw1) solid var(--kac);border-radius:var(--rp);padding:0 12px;cursor:pointer}#prs .sortbar button[aria-pressed="true"]{background:var(--hero);color:var(--onhero)}
@media(max-width:700px){#prs .sortbar{display:flex}}
#prs th button{font:inherit;color:inherit;background:transparent;border:0;padding:0;cursor:pointer}#prs td{padding:6px 12px}#prs td:nth-child(1),#prs td:nth-child(3),#prs td:nth-child(4){white-space:nowrap;overflow-wrap:normal}#prs .tbl{box-shadow:none}
.av{display:grid;place-items:center;width:40px;height:40px;border-radius:50%;background:var(--hbg);color:var(--htext);box-shadow:3px 3px 0 var(--hsh);font:800 1rem/1 var(--body);flex:none}
.num{margin-left:auto;text-align:right}.num b{display:block;font:800 1.5rem/1.2 var(--body)}.num span{font-size:var(--fs-xs);color:var(--csub)}
.rows,.stg2 ul{list-style:none;margin:0;padding:0;display:grid;gap:var(--s2)}
.row{border:var(--bw1) solid var(--line);border-radius:var(--r1);padding:var(--s2) var(--s3);background:var(--tint)}.row.done{opacity:.72}
.rt{font-weight:800;font-size:var(--fs-m);overflow-wrap:anywhere}.rm{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;align-items:center}
.chip{border:var(--bw1) solid var(--kac);border-radius:var(--rp);padding:0 10px;font:800 var(--fs-xs)/1.8 var(--body)}
.st.late{background:var(--hero);color:var(--onhero);border:var(--bw1) solid var(--line)}
.st.soon{background:var(--warn);color:var(--ctext);border:var(--bw1) solid var(--warnbd)}
[hidden]{display:none!important}
.none{margin:0;font-weight:800}
#who li,#prwho li{padding:0}#prwho{margin-bottom:var(--s3)}#who button,#prwho button{font:inherit;color:inherit;background:transparent;border:0;border-radius:var(--rp);padding:0 12px;cursor:pointer}#who button[aria-pressed="true"],#prwho button[aria-pressed="true"]{background:var(--hero);color:var(--onhero)}
.st.set{background:var(--m1);color:#12091F;border:var(--bw1) solid var(--line)}
.pr{font-size:var(--fs-xs);font-weight:800}
.stg2>ul>li{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px var(--s3);align-items:center}.stg2 .bar,.stg2 details{grid-column:1/-1}.stg2 details>summary{cursor:pointer;font:800 var(--fs-s)/2 var(--body)}.stg2 details[open]>summary{margin-bottom:var(--s2)}.sn{font-weight:800}.sv{font-size:var(--fs-xs);color:var(--csub)}
.srows{list-style:none;margin:0;padding:0;gap:0!important}.srows>li{display:block;border-top:1px solid color-mix(in srgb,var(--ctext) 18%,transparent);padding:8px 0}.srows>li:first-child{border-top:0}
.stt{font-weight:400;text-decoration:none;overflow-wrap:anywhere}.stt:hover,.stt:focus-visible{text-decoration:underline}
.srm{display:flex;flex-wrap:wrap;gap:4px 8px;align-items:center;margin-top:2px}.sd{font-size:var(--fs-xs);color:var(--csub)}.srows .pr{font-weight:400;color:var(--csub)}
.sb{display:inline-block;padding:0 8px;border-radius:var(--rp);font:800 var(--fs-xs)/1.7 var(--body)}
.sb.gray{background:#E6E6EA;color:#34343E}.sb.blue{background:#D6E6FB;color:#0F3C78}.sb.green{background:#D3F0DC;color:#0B5A2A}.sb.red{background:#FBD9DC;color:#8A1020}
.stg2 li.w1{--c:var(--m1)}.stg2 li.w2{--c:var(--m2)}.stg2 li.w3{--c:var(--m3)}.stg2 li.w4{--c:#FFFFFF}
.stg2 li[class] .sn{display:inline-block;justify-self:start;padding:0 12px;border:var(--bw1) solid var(--line);border-radius:var(--rp);background:var(--c);color:#2A1B3D}.sn b{margin-left:4px}
.stg2 li[class] .bar{background:#3F3158}.stg2 li[class] .bar i{background:var(--c)}
.ar{display:inline-block;margin-right:6px;padding:0 8px;border:2px solid currentColor;border-radius:var(--rp);background:transparent;font:800 var(--fs-xs)/1.7 var(--body);vertical-align:middle}
.chip.ar{margin-right:0;border-color:currentColor}
.ar-P{color:#5B2A9C}.ar-B{color:#0B6B63}.ar-F{color:#B0145E}.ar-T{color:#8A5200}
.sample{display:inline-block;margin-left:var(--s3);padding:0 14px;border:var(--bw2) solid var(--btxt);border-radius:var(--rp);background:var(--m1);color:#12091F;font:800 var(--fs-m)/1.8 var(--body);vertical-align:middle;-webkit-text-stroke:0}.sample-note{margin:var(--s3) 0 0;font-weight:800;font-size:var(--fs-s)}
.note{font-size:var(--fs-s);color:var(--sub)}
@media(max-width:480px){.ph{flex-wrap:wrap}.num{margin-left:0;text-align:left;width:100%}}
"""


def who_buttons(members):
    """名前ボタン（全員＋表示名）。JS が使えないときは出さない（hidden のまま）"""
    if not members:
        return ""
    btns = '<li><button type="button" data-id="" aria-pressed="true" hidden>全員</button></li>' + "".join(
        f'<li><button type="button" data-id="{e(m["id"])}" aria-pressed="false" hidden>{e(m["name"])}</button></li>'
        for m in members)
    return f'<ul class="meta" id="who" aria-label="担当者で絞る">{btns}</ul>'


# 名前ボタンで絞る。#名前（ASCII の id）で開くと最初から絞れる。localStorage は使えなくても動く
FILTER_JS = """(function(){var w=document.getElementById("who");if(!w)return;var bs=[].slice.call(w.querySelectorAll("button")),K="progress-who";
function ok(i){return bs.some(function(b){return b.getAttribute("data-id")===i})}
function st(){var i="";try{i=decodeURIComponent(location.hash.slice(1)).toLowerCase()}catch(e){}if(i&&ok(i))return i;try{i=localStorage.getItem(K)||""}catch(e){i=""}return ok(i)?i:""}
function show(i){bs.forEach(function(b){b.hidden=false;b.setAttribute("aria-pressed",b.getAttribute("data-id")===i?"true":"false")});
[].forEach.call(document.querySelectorAll("section.pcard[data-who]"),function(c){c.hidden=!!i&&c.getAttribute("data-who")!==i});
var al=document.getElementById("al");if(al){var n=0;[].forEach.call(al.querySelectorAll("li[data-who]"),function(l){var h=!!i&&(" "+l.getAttribute("data-who")+" ").indexOf(" "+i+" ")<0;l.hidden=h;if(!h)n++});var z=al.querySelector(".none");if(z)z.hidden=n>0}
}
bs.forEach(function(b){b.addEventListener("click",function(){var i=b.getAttribute("data-id");try{localStorage.setItem(K,i)}catch(e){}try{history.replaceState(null,"",i?"#"+i:location.pathname+location.search)}catch(e){}show(i)})});
window.addEventListener("hashchange",function(){show(st())});show(st())})();"""


# 直近 PR の表専用の名前ボタン（上のボタンとは独立。保存キーも別）。全員=全体の最近10件、名前=その人の最近10件
PRWHO_JS = """(function(){var w=document.getElementById("prwho"),tb=document.querySelector("#prs tbody");if(!w||!tb)return;var bs=[].slice.call(w.querySelectorAll("button")),K="progress-prwho";
function ok(i){return bs.some(function(b){return b.getAttribute("data-id")===i})}
function show(i){bs.forEach(function(b){b.hidden=false;b.setAttribute("aria-pressed",b.getAttribute("data-id")===i?"true":"false")});var c=0;
[].forEach.call(tb.rows,function(r){var h=i?r.getAttribute("data-who")!==i:r.getAttribute("data-top")!=="1";r.hidden=h;if(!h)c++});var n=document.getElementById("prn");if(n)n.textContent=c}
bs.forEach(function(b){b.addEventListener("click",function(){var i=b.getAttribute("data-id");try{localStorage.setItem(K,i)}catch(e){}show(i)})});
var i="";try{i=localStorage.getItem(K)||""}catch(e){}show(ok(i)?i:"")})();"""


# 直近 PR の表: 列見出しで並べ替え。担当者は押すたびに 昇順 → 逆順。既定はマージ日時の新しい順
SORT_JS = """(function(){var t=document.querySelector("#prs tbody");if(!t)return;var bs=[].slice.call(document.querySelectorAll("#prs button[data-k]")),cur="t",dir=-1;
function key(r,k){return k==="a"?r.getAttribute("data-a"):r.getAttribute("data-t")}
function go(k){dir=(k===cur)?-dir:(k==="t"?-1:1);cur=k;var rs=[].slice.call(t.rows);rs.sort(function(x,y){var a=key(x,k),b=key(y,k),c=a<b?-1:a>b?1:0;if(k==="a"&&c===0){return x.getAttribute("data-t")<y.getAttribute("data-t")?1:-1}return c*dir});rs.forEach(function(r){t.appendChild(r)});
bs.forEach(function(b){var on=b.getAttribute("data-k")===k,h=b.parentNode,sp=b.querySelector("span");if(h.tagName==="TH"){h.setAttribute("aria-sort",on?(dir>0?"ascending":"descending"):"none");sp.textContent=on?(dir>0?"▲":"▼"):"⇅"}else{b.setAttribute("aria-pressed",on?"true":"false")}})}
bs.forEach(function(b){b.addEventListener("click",function(){go(b.getAttribute("data-k"))})})})();"""


def page(body, updated, sample=False, members=()):
    return f"""<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>進捗ダッシュボード｜雷禅・黄泉・軀</title>
<meta name="description" content="担当者ごとの Issue の進み具合。GitHub の Issue とマイルストーンから自動で作られる。">
<meta name="theme-color" content="#2A1B3D">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@500;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="kb/kb.css">
<style>{CSS}</style>
</head>
<body>
<header class="kb-band"><div class="kb-in">
<div class="kb-nav"><a href="hub.html">← 開発ハブ</a></div>
<h1>進捗ダッシュボード{'<span class="sample">サンプル</span>' if sample else ''}</h1>
<p class="upd" title="{e(updated)}">更新 {e(updated.split()[1] if " " in updated else updated)}</p>
{'<p class="sample-note">ダミーデータの表示例です。実際の Issue ではありません。</p>' if sample else ''}
{who_buttons(members)}
</div></header>
<main class="kb"><div class="pg">
{body}
<p class="note">担当者ごとの Issue の進み具合。GitHub の Issue とマイルストーンから自動で作られる。数えるのは Issue だけ。数え方: 完了＝閉じた Issue。PR は Issue にぶら下げて出すだけで数えない（PR 本文の「Closes #番号」でひも付く）。状態は、つながる PR がなければ未着手、Draft の PR があれば作業中、Ready の PR があればレビュー待ち。ひも付く PR がマージ済みなのに Issue が開いているものは「マージ済み・Issue 未完了」（暫定。数えるのは Issue だけなので未完了のまま）。領域別の件数は Issue 題の頭文字（P=PM／B=DB・API／F=画面／T=テスト）。期限・遅延は段階（マイルストーン）の期限。更新: main へのマージ時・Issue の開閉や担当・段階の変更のとき・毎朝1回（日本時間）。</p>
</div></main>
<script src="kb/kb.js" defer></script>
<script>{FILTER_JS}</script>
<script>{PRWHO_JS}</script>
<script>{SORT_JS}</script>
</body>
</html>
"""


def now_section(model):
    """🔥 いま動くこと: 行動に直結するものだけ。名前ボタンで絞ると自分の分だけになる（data-who）"""
    nm = model["name_of"]
    who = lambda r: [nm.get(a, NO_ASSIGNEE) if a else NO_ASSIGNEE for a in r["assignees"]]
    items = []
    for r in model["alerts"]:
        items.append(render_row(r, who(r), mark="⚠ " if r["late"] else "⏰ ", badge=True))
    shown = {r["number"] for r in model["alerts"]}
    for p in model["review_prs"]:
        items.append(f'<li class="row" data-who="{e(p["who"])}"><div class="rt">👀 <a href="{e(safe_url(p["url"]))}">PR #{p["number"]} {e(p["title"])}</a></div>'
                     f'<div class="rm"><span class="st live">レビュー待ち</span><span class="chip">{e(p["author"])}</span></div></li>')
    for p in model["people"]:
        for r in p["rows"]:
            if r["status"] == "merged" and r["number"] not in shown:
                shown.add(r["number"])
                items.append(render_row(r, who(r), mark="✅ ", extra='<span class="chip">Issue を閉じるだけ</span>', badge=True))
    return ('<section class="pcard" id="al"><h3 style="margin:0">🔥 いま動くこと</h3>'
            f'<ul class="rows">{"".join(items)}</ul>'
            f'<p class="none"{" hidden" if items else ""}>いま急ぐものはありません 🎉</p></section>')


def render(model, updated, sample=False):
    mem = model.get("members", [])
    if not model["total"] and not model["stages"]:
        body = ('<div class="empty"><h3>まだ Issue がありません</h3>'
                '<p>Issue に担当者とマイルストーン（段階）を付けて立てると、ここに担当者ごとの進み具合が出ます。</p></div>')
        return page(body + render_prs(model.get("merged_pool", model.get("merged_prs", [])), model.get("members", [])), updated, sample, mem)
    pc = pct(model["done"], model["total"])
    parts = [f'<div class="allbar"><p>全体 {pc}% <span>（完了 {model["done"]} / {model["total"]}）</span></p>'
             f'<div class="bar" role="img" aria-label="全体 {pc}%"><i style="width:{pc}%"></i></div></div>',
             now_section(model)]
    if model["total"]:
        parts.append('<div class="pgrid">' + "".join(render_person(p) for p in model["people"]) + "</div>")
    if model["stages"]:
        parts.append('<section class="stg2"><h3 style="margin:0">段階ごと</h3><ul>'
                     + "".join(render_stage(s, model["name_of"]) for s in model["stages"]) + "</ul></section>")
    if not model["total"]:
        parts.append('<div class="empty"><h3>まだ Issue がありません</h3><p>段階（マイルストーン）だけ作られています。</p></div>')
    parts.append(render_prs(model.get("merged_pool", model.get("merged_prs", [])), model.get("members", [])))
    return page("\n".join(parts), updated, sample, mem)


def build_summary(model, updated_at, sample=False):
    """progress.html と同じ model から作る。遅れ・期限が近いの判定は model の alerts（build_model）を共有"""
    alerts = model["alerts"]
    out = {"updatedAt": updated_at, "total": model["total"], "closed": model["done"],
           "overdue": sum(1 for r in alerts if r["late"]),
           "dueSoon": sum(1 for r in alerts if not r["late"]),
           "byPerson": [{"name": p["name"],
                         "closed": sum(1 for r in p["rows"] if r["done"]),
                         "open": sum(1 for r in p["rows"] if not r["done"]),
                         "overdue": sum(1 for r in p["rows"] if r["late"])} for p in model["people"]],
           # start は前の段階の期限の翌日（画面の期間と同じ）。期限か前の段階が無ければ null
           "phases": [{"title": x["title"], "closed": x["done"], "total": x["total"],
                       "start": x["start"].isoformat() if x["start"] else None,
                       "due": x["due"].isoformat() if x["due"] else None,
                       "merged_open": sum(1 for r in x["rows"] if r["status"] == "merged")}
                      for x in model["stages"] if x["title"] != NO_MILESTONE],
           "today": dict(model["today_counts"])}
    if sample:
        out["sample"] = True  # ダミーデータから作った（--data）
    return out


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
    updated_at = now.isoformat(timespec="seconds") if not a.today else f"{today.isoformat()}T00:00:00+09:00"
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
        model = build_model(issues, milestones, load_names(a.names), today)
        text = render(model, updated, sample=bool(a.data))
        summary = build_summary(model, updated_at, sample=bool(a.data))
    except Exception as ex:  # 公開全体を止めない
        print(f"warning: 進捗を作れませんでした: {type(ex).__name__}", file=sys.stderr)
        text = error_page(type(ex).__name__, updated)
        summary = {"updatedAt": updated_at, "error": type(ex).__name__}
    with open(out, "w", encoding="utf-8") as f:
        f.write(text)
    with open(os.path.join(a.out, "progress-summary.json"), "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"wrote {out} and progress-summary.json")


if __name__ == "__main__":
    main()
