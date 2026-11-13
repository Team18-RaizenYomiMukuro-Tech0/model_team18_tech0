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

# 一覧ページから開く「設計の変更」（文書を変えた Issue）。開発ハブにあった「今週の変更点」と同じ URL
DESIGN_CHANGE_URL = "https://github.com/Team18-RaizenYomiMukuro-Tech0/model_team18_tech0/issues?q=label%3Adesign-change"

MERMAID_VERSION = "11.4.0"
MERMAID_URL = f"https://cdn.jsdelivr.net/npm/mermaid@{MERMAID_VERSION}/dist/mermaid.esm.min.mjs"

CSS = """
/* 見た目は docs/kb/kb.css（ハブ・ナレッジ記事・review-rule.html と共通）。ここは 5文書だけに要る分（タブ・本文・決まったこと・表のスクロール）を足す */
.kb{max-width:60rem}
.kb-nav{flex-wrap:wrap;justify-content:flex-start;gap:var(--s2) var(--s3)}
.kb-nav a{border-bottom-color:transparent;padding:2px 8px;border-radius:var(--r1)}
.kb-nav a.home{margin-right:auto;border-bottom-color:var(--btxt)}
.kb-nav a[aria-current=page]{border:var(--bw1) solid var(--btxt);background:rgba(255,255,255,.14)}
.kb h2{margin:var(--s5) 0 var(--s2);padding-bottom:var(--s2);border-bottom:var(--bw1) dashed var(--kac);font:800 1.3rem/var(--lh-t) var(--body);scroll-margin-top:12px}
.kb h3{margin:var(--s4) 0 var(--s2);font:800 var(--fs-l)/var(--lh-t) var(--body)}
.kb h4,.kb h5{margin:var(--s3) 0 var(--s1);font:800 var(--fs-m)/var(--lh-t) var(--body)}
.kb p{margin:var(--s2) 0}
.kb ul,.kb ol{padding-left:1.5em}
.kb li{margin:var(--s1) 0}
.kb>*+*{margin-top:0}
.kb blockquote{margin:var(--s3) 0;padding:var(--s2) var(--s4);background:var(--card);color:var(--csub);border:var(--bw1) solid var(--line);border-left:8px solid var(--kac);border-radius:var(--r1)}
.kb blockquote p{margin:var(--s1) 0}
.table-wrap{overflow-x:auto;margin:var(--s3) 0;background:var(--card);color:var(--ctext);border:var(--bw1) solid var(--line);border-radius:var(--r2);box-shadow:var(--sh1)}
.table-wrap table{display:table;width:100%;min-width:100%;font-size:var(--fs-s);line-height:1.6}
.table-wrap thead{display:table-header-group}.table-wrap tbody{display:table-row-group}
.table-wrap tr{display:table-row;padding:0;border:0}
.table-wrap th,.table-wrap td{display:table-cell;border:0;border-top:var(--bw1) solid color-mix(in srgb,var(--ctext) 14%,transparent);padding:6px 12px;vertical-align:top;text-align:left;overflow-wrap:normal}
.table-wrap th{border-top:0;white-space:nowrap}
.table-wrap td::before{display:none}
tr:target td,tr:target th{background:var(--warn);color:var(--text)}
pre{margin:var(--s3) 0}
pre.mermaid{background:var(--card);border-color:var(--line);text-align:center}
.decided{background:var(--warn);color:var(--text);border:var(--bw1) solid var(--warnbd);border-left:12px solid var(--warnbd);border-radius:var(--r2);padding:var(--s3) var(--s4);margin:var(--s4) 0}
.decided>h2{font:800 var(--fs-m)/1.6 var(--body);margin:0 0 var(--s2);border:0;padding:0}
.decided .table-wrap{box-shadow:none}
ul.projects{list-style:none;padding:0}
ul.projects li{margin:var(--s2) 0;padding:var(--s3) var(--s4);background:var(--card);color:var(--ctext);border:var(--bw2) solid var(--line);border-radius:var(--r2);box-shadow:var(--sh1)}
.kb a.idlink,.kb a.idref{font-weight:800}
.kb-foot{line-height:1.8}
@media(max-width:700px){.kb h2{font-size:1.15rem}}
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


EXT_HREF_RE = re.compile(r'\shref=["\'](?:https?:)?//', re.I)


def externalize(h):
    """外のサイト（github.com など）へのリンクを別タブで開く。同じサイトの中（相対・#）は同じタブのまま"""
    def repl(m):
        attrs = m.group(1)
        if EXT_HREF_RE.search(attrs) and "target=" not in attrs:
            return f'<a{attrs} target="_blank" rel="noopener">'
        return m.group(0)

    return re.sub(r"<a\b([^>]*)>", repl, h)


# タブのアイコン（docs/hub.html の <head> と同じ4行。画像は hub-assets/ への相対パスで、ページの深さに合わせて ../ を足す）
ICON_LINES = (
    '<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22%3E%3Crect width=%2264%22 height=%2264%22 rx=%2214%22 fill=%22%232A1B3D%22/%3E%3Cpath d=%22M0 64V50l12-5 8 3 10-8 12 6 8-4 14 5v17z%22 fill=%22%2312091F%22/%3E%3Ccircle cx=%2222%22 cy=%2221%22 r=%2211%22 fill=%22%23FFD700%22 stroke=%22%23fff%22 stroke-width=%223%22/%3E%3Ccircle cx=%2242%22 cy=%2221%22 r=%2211%22 fill=%22%2340E0D0%22 stroke=%22%23fff%22 stroke-width=%223%22/%3E%3Ccircle cx=%2232%22 cy=%2238%22 r=%2211%22 fill=%22%23FF69B4%22 stroke=%22%23fff%22 stroke-width=%223%22/%3E%3C/svg%3E">',
    '<link rel="icon" type="image/png" sizes="32x32" href="{up}hub-assets/favicon-32.png">',
    '<link rel="icon" type="image/png" sizes="16x16" href="{up}hub-assets/favicon-16.png">',
    '<link rel="apple-touch-icon" href="{up}hub-assets/apple-touch-icon.png">',
)


def icon_links(up):
    return "\n".join(l.replace("{up}", up) for l in ICON_LINES) + "\n"


def page(title, body, nav_html, footer_html, mermaid, up="../"):
    script = ""
    if mermaid:
        script = (
            '<script type="module">'
            f'import mermaid from "{MERMAID_URL}";'
            'mermaid.initialize({startOnLoad:true,theme:"default"});'
            "</script>"
        )
    # 帯（docs/kb/kb.css の .kb-band）＋本文（.kb）＋フッター（.kb-foot）。手本は scripts/build-review-rule.py
    m = re.match(r"\s*<h1>(.*?)</h1>(.*)", body, re.S)
    h1, rest = (m.group(1), m.group(2)) if m else (html.escape(title), body)
    if not nav_html:
        nav_html = '<a class="home" href="../hub.html">← 開発ハブ</a>'
    else:
        nav_html = nav_html.replace('<nav class="docs" aria-label="5文書">', "").replace("</nav>", "")
    head = (
        '<!doctype html>\n<html lang="ja">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width,initial-scale=1">\n<meta name="color-scheme" content="light">\n'
        f"<title>{html.escape(title)}</title>\n" + icon_links(up)
        + '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
        '<link href="https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@500;800&display=swap" rel="stylesheet">\n'
        f'<link rel="stylesheet" href="{up}kb/kb.css">\n<style>{CSS}</style>\n</head>\n<body>\n'
    )
    band = (
        f'<header class="kb-band"><div class="kb-in">\n<nav class="kb-nav" aria-label="5文書">{nav_html}</nav>\n'
        f'<h1>{h1}</h1>\n</div></header>\n'
    )
    main = f'<main class="kb">\n{rest}\n</main>\n<footer class="kb-foot">{footer_html}</footer>\n'
    return head + externalize(band + main) + f"{script}\n</body>\n</html>\n"


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
        (out_dir / f"{key}.html").write_text(page(title, body, "".join(nav), footer, mermaid, up="../../"), encoding="utf-8")


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
        f'<p><a href="{DESIGN_CHANGE_URL}">🧬 設計の変更</a> — 文書を変えた Issue（design-change ラベル）</p>'
    )
    footer = f"生成元コミット: <code>{html.escape(commit[:7] if commit else '不明')}</code>"
    d = out_root / "docs5"
    d.mkdir(parents=True, exist_ok=True)
    (d / "index.html").write_text(page("5文書（HTML 版）", body, "", footer, False, up="../"), encoding="utf-8")


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
