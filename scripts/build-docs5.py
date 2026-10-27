#!/usr/bin/env python3
"""5文書（要求・要件・仕様・設計・テスト設計の .md）を読みやすい HTML にする。

書くのは今までどおり .md だけ。HTML はビルド時に生成し、コミットしない。
  生成先: <out>/docs5/<案件フォルダ>/{youkyu,youken,shiyou,sekkei,test}.html と <out>/docs5/index.html

各ページの機能:
  - 先頭に「この文書で決まったこと」欄（.md に該当の節があるときだけ抜き出して出す。節がなければ枠ごと省略）
  - R/F/N/SP/DATA/D/AC/U/I/S/A の ID を、定義のある文書の表の行へのアンカーにして、文書間でリンク
  - ```mermaid のコードブロックは図として表示
  - ページ下に元の .md へのリンクと生成元コミット ID

依存: Python 標準ライブラリ + markdown パッケージ1つ（pip install markdown==3.7）。

使い方:  python3 scripts/build-docs5.py [--out _site] [--project <案件フォルダ名>]
"""
import argparse
import html
import os
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import quote

import markdown

ROOT = Path(__file__).resolve().parent.parent
PROJECTS_DIR = "02_プロジェクト"
TEMPLATE_DIR = "_template"

# (出力ファイル名, 元 .md のファイル名, 表示名)
DOCS = [
    ("youkyu", "要求.md", "要求"),
    ("youken", "要件.md", "要件"),
    ("shiyou", "仕様.md", "仕様"),
    ("sekkei", "設計.md", "設計"),
    ("test", "テスト設計.md", "テスト設計"),
]

# ID の接頭辞 → その ID を「定義」する文書（出力ファイル名）
ID_OWNER = {
    "R": "youkyu", "AC": "youkyu",
    "F": "youken", "N": "youken",
    "SP": "shiyou", "DATA": "shiyou",
    "D": "sekkei",
    "U": "test", "I": "test", "S": "test", "A": "test",
}
ID_RE = re.compile(r"(?<![A-Za-z0-9_\-])(" + "|".join(sorted(ID_OWNER, key=len, reverse=True)) + r")-(\d+)(?![A-Za-z0-9_\-])")

# 「この文書で決まったこと」の節の見出し
DECIDED_RE = re.compile(r"^(#{2,6})\s*(?:この文書で)?(?:決まったこと|決定事項|決定したこと)\s*$")

MERMAID_VERSION = "11.4.0"
MERMAID_URL = f"https://cdn.jsdelivr.net/npm/mermaid@{MERMAID_VERSION}/dist/mermaid.esm.min.mjs"

CSS = """
:root{--bg:#fff;--fg:#1f2328;--muted:#59636e;--line:#d1d9e0;--soft:#f6f8fa;--accent:#0969da;--decided:#fff8c5;--decided-line:#d4a72c}
@media (prefers-color-scheme:dark){:root{--bg:#0d1117;--fg:#e6edf3;--muted:#9198a1;--line:#3d444d;--soft:#151b23;--accent:#4493f8;--decided:#2d2a12;--decided-line:#9e6a03}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.75 system-ui,-apple-system,"Hiragino Sans","Noto Sans JP","Yu Gothic",sans-serif}
main{max-width:60rem;margin:0 auto;padding:0 16px 48px}
a{color:var(--accent)}
nav.docs{position:sticky;top:0;background:var(--bg);border-bottom:1px solid var(--line);padding:8px 16px;display:flex;gap:4px 14px;flex-wrap:wrap;align-items:center;z-index:5}
nav.docs a{text-decoration:none;padding:2px 8px;border-radius:6px}
nav.docs a[aria-current=page]{background:var(--soft);font-weight:700;border:1px solid var(--line)}
nav.docs .home{margin-right:auto}
h1{font-size:1.7rem;line-height:1.4;margin:1.4rem 0 .6rem}
h2{font-size:1.25rem;margin:2rem 0 .6rem;padding-bottom:.25rem;border-bottom:1px solid var(--line)}
h3{font-size:1.05rem;margin:1.4rem 0 .4rem}
.table-wrap{overflow-x:auto;margin:.8rem 0}
table{border-collapse:collapse;font-size:.92rem;line-height:1.55;min-width:100%}
th,td{border:1px solid var(--line);padding:6px 10px;vertical-align:top;text-align:left}
th{background:var(--soft);white-space:nowrap}
tr:target td,tr:target th{background:var(--decided)}
blockquote{margin:.8rem 0;padding:.2rem 1rem;border-left:4px solid var(--line);color:var(--muted)}
code{background:var(--soft);padding:.1em .35em;border-radius:4px;font-size:.9em}
pre{background:var(--soft);padding:12px;border-radius:6px;overflow-x:auto}
pre code{background:none;padding:0}
pre.mermaid{background:none;text-align:center}
.decided{background:var(--decided);border:1px solid var(--decided-line);border-radius:8px;padding:.6rem 1rem;margin:1rem 0}
.decided>h2{font-size:1rem;margin:.2rem 0 .4rem;border:0;padding:0}
footer{margin-top:3rem;padding-top:1rem;border-top:1px solid var(--line);color:var(--muted);font-size:.85rem}
ul.projects{list-style:none;padding:0}
ul.projects li{margin:.4rem 0}
@media (max-width:600px){body{font-size:15px}h1{font-size:1.4rem}}
"""


def git(*args):
    try:
        return subprocess.check_output(["git", *args], cwd=ROOT, text=True, stderr=subprocess.DEVNULL).strip()
    except (OSError, subprocess.CalledProcessError):
        return ""


def repo_info():
    """(owner/repo, commit) を返す。Actions では環境変数、ローカルでは git から。"""
    commit = os.environ.get("GITHUB_SHA") or git("rev-parse", "HEAD")
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    if not repo:
        m = re.search(r"github\.com[:/]([^/]+/[^/.]+?)(?:\.git)?$", git("config", "--get", "remote.origin.url"))
        repo = m.group(1) if m else ""
    return repo, commit


def new_markdown():
    # 生の HTML は通さずエスケープする（<案件名> のような山括弧もそのまま見える）
    md = markdown.Markdown(extensions=["tables", "fenced_code", "sane_lists"])
    md.preprocessors.deregister("html_block")
    md.inlinePatterns.deregister("html")
    return md


def render(text):
    html_text = new_markdown().convert(text)
    html_text = re.sub(
        r'<pre><code class="language-mermaid">(.*?)</code></pre>',
        lambda m: '<pre class="mermaid">' + m.group(1) + "</pre>",
        html_text,
        flags=re.S,
    )
    return html_text.replace("<table>", '<div class="table-wrap"><table>').replace("</table>", "</table></div>")


def extract_decided(text):
    """「この文書で決まったこと」の節（見出しは本文から外す）を (節の本文, 残りの本文) で返す。なければ ("", text)。"""
    lines = text.splitlines()
    in_fence = False
    for i, line in enumerate(lines):
        if line.lstrip().startswith("```"):
            in_fence = not in_fence
        m = None if in_fence else DECIDED_RE.match(line)
        if not m:
            continue
        level = len(m.group(1))
        end = len(lines)
        fence = False
        for j in range(i + 1, len(lines)):
            if lines[j].lstrip().startswith("```"):
                fence = not fence
            h = None if fence else re.match(r"^(#{1,6})\s", lines[j])
            if h and len(h.group(1)) <= level:
                end = j
                break
        return "\n".join(lines[i + 1:end]).strip(), "\n".join(lines[:i] + lines[end:])
    return "", text


TAG_SPLIT = re.compile(r"(<[^>]+>)")


def link_ids(html_text, doc_key, defined):
    """HTML のテキスト部分にある ID をリンク／アンカーにする。

    defined: {ID: 定義した文書キー}（先に全文書を走査して作る）
    表の行の先頭セルが ID だけなら、その文書が持ち主のとき行に id を付ける。
    """
    out = []
    anchored = set()    # この文書で id を付け終えた ID（同じ ID の2回目以降はリンクにする）
    skip = 0           # <code>/<pre>/<a> の内側
    first_cell = False  # 直前が <tr> の次の最初のセル
    for part in TAG_SPLIT.split(html_text):
        if part.startswith("<"):
            tag = re.match(r"</?([a-zA-Z0-9]+)", part)
            name = tag.group(1).lower() if tag else ""
            closing = part.startswith("</")
            if name in ("code", "pre", "a"):
                skip += -1 if closing else 1
                skip = max(skip, 0)
            if name == "tr" and not closing:
                first_cell = True
            out.append(part)
            continue
        if not part.strip() or skip:
            out.append(part)
            if part.strip():
                first_cell = False
            continue

        def repl(m, is_first=first_cell, whole=part.strip()):
            id_ = f"{m.group(1)}-{m.group(2)}"
            owner = defined.get(id_)
            if owner is None:
                return m.group(0)
            if owner == doc_key and is_first and whole == id_ and id_ not in anchored:
                anchored.add(id_)
                return f'<a id="{id_}" href="#{id_}" class="idlink">{id_}</a>'
            href = f"#{id_}" if owner == doc_key else f"{owner_file(owner)}#{id_}"
            return f'<a class="idref" href="{href}">{id_}</a>'

        out.append(ID_RE.sub(repl, part))
        first_cell = False
    return "".join(out)


def owner_file(key):
    return key + ".html"


ROW_ID_RE = re.compile(r"^\|\s*((?:" + "|".join(sorted(ID_OWNER, key=len, reverse=True)) + r")-\d+)\s*\|")


def collect_defined(texts):
    """各文書の表で「先頭セルが ID だけの行」から {ID: 文書キー} を作る。ID の持ち主の文書にあるものだけ数える。"""
    defined = {}
    for key, text in texts.items():
        for line in text.splitlines():
            m = ROW_ID_RE.match(line)
            if m and ID_OWNER.get(m.group(1).split("-")[0]) == key:
                defined.setdefault(m.group(1), key)
    return defined


def page(title, body, nav_html, footer_html, mermaid):
    script = ""
    if mermaid:
        script = (
            '<script type="module">'
            f'import mermaid from "{MERMAID_URL}";'
            'const dark=matchMedia("(prefers-color-scheme: dark)").matches;'
            'mermaid.initialize({startOnLoad:true,theme:dark?"dark":"default"});'
            "</script>"
        )
    return (
        "<!doctype html>\n<html lang=\"ja\">\n<head>\n<meta charset=\"utf-8\">\n"
        "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n"
        f"<title>{html.escape(title)}</title>\n<style>{CSS}</style>\n</head>\n<body>\n"
        f"{nav_html}\n<main>\n{body}\n<footer>{footer_html}</footer>\n</main>\n{script}\n</body>\n</html>\n"
    )


def build_project(project, out_root, repo, commit):
    src_dir = ROOT / PROJECTS_DIR / project
    texts = {}
    for key, fname, _ in DOCS:
        p = src_dir / fname
        texts[key] = p.read_text(encoding="utf-8") if p.exists() else None
    defined = collect_defined({k: v for k, v in texts.items() if v})
    out_dir = out_root / "docs5" / project
    out_dir.mkdir(parents=True, exist_ok=True)
    short = commit[:7] if commit else "不明"

    for key, fname, label in DOCS:
        nav = ['<nav class="docs" aria-label="5文書"><a class="home" href="../index.html">一覧へ</a>']
        for k2, _, l2 in DOCS:
            cur = ' aria-current="page"' if k2 == key else ""
            nav.append(f'<a href="{k2}.html"{cur}>{l2}</a>')
        nav.append("</nav>")

        rel_md = f"{PROJECTS_DIR}/{project}/{fname}"
        blob = f"https://github.com/{repo}/blob/{commit}/{quote(rel_md)}" if repo and commit else ""
        text = texts[key]
        if text is None:
            body = f"<h1>{label}</h1><p>この文書（<code>{html.escape(rel_md)}</code>）はまだありません。</p>"
            mermaid = False
        else:
            decided_md, rest = extract_decided(text)
            decided_html = render(decided_md) if decided_md else ""
            # 節が無い（または中身が空の）文書では枠ごと出さない。ある場合は先頭の h1 の直後に置く
            has_decided = bool(re.sub(r"<[^>]+>|\s", "", decided_html))
            main_html = render(rest)
            decided_box = (
                f'<section class="decided" aria-label="この文書で決まったこと"><h2>この文書で決まったこと</h2>{decided_html}</section>'
                if has_decided else ""
            )
            m = re.match(r"\s*(<h1>.*?</h1>)(.*)", main_html, re.S)
            main_html = (m.group(1) + decided_box + m.group(2)) if m else decided_box + main_html
            body = link_ids(main_html, key, defined)
            body = rewrite_links(body, project, repo, commit)
            mermaid = 'class="mermaid"' in body

        links = f'元の文書: <a href="{blob}">{html.escape(rel_md)}</a>' if blob else f"元の文書: <code>{html.escape(rel_md)}</code>"
        footer = f"{links}<br>生成元コミット: <code>{html.escape(short)}</code>（この HTML は .md から自動生成。直接は編集しません）"
        title = f"{label} — {project}"
        (out_dir / f"{key}.html").write_text(page(title, body, "".join(nav), footer, mermaid), encoding="utf-8")


def rewrite_links(body, project, repo, commit):
    """文書内の相対リンク（inputs/... など）を、GitHub 上の元ファイルへのリンクにする。ID・ページ間のリンクはそのまま。"""
    if not (repo and commit):
        return body

    def repl(m):
        href = m.group(1)
        if re.match(r"^(?:[a-z][a-z0-9+.\-]*:|#|/)", href, re.I) or re.search(r"\.html(?:#|$)", href):
            return m.group(0)
        return f'href="https://github.com/{repo}/blob/{commit}/{quote(PROJECTS_DIR + "/" + project + "/" + href)}"'

    return re.sub(r'href="([^"]*)"', repl, body)


def pick_projects(only):
    base = ROOT / PROJECTS_DIR
    if only:
        return [only]
    dirs = [d.name for d in sorted(base.iterdir()) if d.is_dir() and any((d / f).exists() for _, f, _ in DOCS)]
    real = [d for d in dirs if d != TEMPLATE_DIR]
    return real or ([TEMPLATE_DIR] if TEMPLATE_DIR in dirs else [])


def build_index(projects, out_root, commit):
    items = []
    for p in projects:
        links = " / ".join(f'<a href="{p}/{k}.html">{l}</a>' for k, _, l in DOCS)
        items.append(f"<li><strong>{html.escape(p)}</strong>: {links}</li>")
    body = (
        "<h1>5文書（HTML 版）</h1>"
        "<p>要求 → 要件 → 仕様 → 設計 → テスト設計。.md から自動生成した読み取り用のページです。</p>"
        f'<ul class="projects">{"".join(items) or "<li>対象の案件フォルダがありません</li>"}</ul>'
    )
    footer = f"生成元コミット: <code>{html.escape(commit[:7] if commit else '不明')}</code>"
    d = out_root / "docs5"
    d.mkdir(parents=True, exist_ok=True)
    (d / "index.html").write_text(page("5文書（HTML 版）", body, "", footer, False), encoding="utf-8")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default="_site", help="出力先ディレクトリ（既定: _site）")
    ap.add_argument("--project", help="案件フォルダ名（省略時は 02_プロジェクト 内の全案件。_template は他に案件がないときだけ）")
    args = ap.parse_args()

    out_root = Path(args.out)
    repo, commit = repo_info()
    projects = pick_projects(args.project)
    if not projects:
        print("対象の案件フォルダがありません", file=sys.stderr)
        return 1
    for p in projects:
        build_project(p, out_root, repo, commit)
    build_index(projects, out_root, commit)
    print(f"生成: {out_root}/docs5/ ({', '.join(projects)}) commit={commit[:7] or '不明'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
