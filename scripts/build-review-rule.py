#!/usr/bin/env python3
"""PR レビュー規定（00_ルール/PRレビュー規定.md）を、開発ハブと同じデザインの HTML にする。

書くのは今までどおり .md だけ。HTML はビルド時に生成し、コミットしない。
  生成先: <out>/review-rule.html（docs/ と同じ階層に置く。docs/kb/kb.css を使う）

  - §2〜§6 の節をカードで見せる。中身は .md の文をそのまま HTML にする（要約で言い換えない）。表・箇条書きも .md から自動で取る
  - 流れ図は固定（PR を作る → AI レビュー → ai-approved ／ needs-human → マージ）。.md の §2・§4・§6 に合わせてある。
    .md に図が頼る語が無くなったら、古い図を出さないようにビルドを失敗させる
  - ページ下に元の .md への GitHub リンクと、表示中のコミット ID

使い方:  python3 scripts/build-review-rule.py [--out _site]
依存: Python 標準ライブラリ + markdown パッケージ（build-docs5.py と同じ）
"""
import argparse
import html
import importlib.util
import re
import sys
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
SRC = "00_ルール/PRレビュー規定.md"
SHOWN = (2, 3, 4, 5, 6)  # カードにする節（§1 は対象の説明なので出さない）

_spec = importlib.util.spec_from_file_location("bd5", Path(__file__).with_name("build-docs5.py"))
bd5 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bd5)

# 流れ図が頼っている .md の語（無ければ図が古い）
FLOW_NEEDS = {2: ["ai-review:doing", "Draft"], 4: ["ai-approved", "needs-human", "作成者以外"], 6: ["ai-approved", "needs-human"]}

CSS = """
.rr-lead{margin:0 0 var(--s4);font-size:var(--fs-m);color:var(--sub)}
.rr-card{background:var(--card);color:var(--ctext);border:var(--bw2) solid var(--line);border-radius:var(--r2);box-shadow:var(--sh1);padding:var(--s3) var(--s4);margin:var(--s4) 0}
.rr-card h2{margin:0 0 var(--s2);font:800 1.15rem/var(--lh-t) var(--body);display:flex;gap:var(--s2);align-items:center;flex-wrap:wrap}
.rr-card h2 .no{display:inline-grid;place-items:center;min-width:2em;height:2em;border-radius:50%;background:var(--hbg);color:var(--htext);box-shadow:3px 3px 0 var(--hsh);font-size:.85rem}
.rr-card p{margin:var(--s2) 0}
.rr-card ul,.rr-card ol{margin:var(--s2) 0;padding-left:1.4em}
.rr-card li{margin:var(--s1) 0}
.table-wrap{overflow-x:auto;margin:var(--s2) 0}
.rr-card table{border-collapse:collapse;font-size:var(--fs-s);line-height:1.6;min-width:100%}
.rr-card th,.rr-card td{border:var(--bw1) solid var(--line);padding:6px 10px;vertical-align:top;text-align:left}
.rr-card th{background:var(--tint);color:var(--ctext);white-space:nowrap}
.rr-card td:first-child{white-space:nowrap}
.rr-flow,.rr-flow ol{list-style:none;margin:var(--s3) 0;padding:0}
.rr-flow{display:grid;gap:var(--s2)}
.rr-flow>li{margin:0;padding:0}
.rr-flow .box{display:block;background:var(--tint);border:var(--bw1) solid var(--line);border-radius:var(--r1);padding:var(--s2) var(--s3)}
.rr-flow .arrow{display:block;text-align:center;font-weight:800;color:var(--csub)}
.rr-branch{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--s3);margin:0!important}
.rr-branch>li{display:grid;gap:var(--s2);align-content:start;margin:0}
.rr-branch h3{margin:0;font:800 var(--fs-m)/1.5 var(--body)}
.rr-flow .ok{background:var(--okbg)}
.rr-flow .hum{background:var(--warn);border-color:var(--warnbd)}
@media(max-width:700px){.rr-branch{grid-template-columns:minmax(0,1fr)}}
"""

FLOW = """<ol class="rr-flow" aria-label="PR レビューの流れ">
<li><span class="box">① PR を作る（Draft でない PR）</span></li>
<li><span class="arrow" aria-hidden="true">↓</span></li>
<li><span class="box">② AI レビュー（各自の Claude が判定し、ラベルを付ける）</span></li>
<li><span class="arrow" aria-hidden="true">↓</span></li>
<li><ol class="rr-branch">
<li><h3>ラベル <code>ai-approved</code> のとき</h3><span class="box ok">③ 作成者がマージする</span></li>
<li><h3>ラベル <code>needs-human</code> のとき</h3><span class="box hum">③ 作成者以外が承認する</span><span class="arrow" aria-hidden="true">↓</span><span class="box hum">④ 作成者がマージする</span></li>
</ol></li>
</ol>"""


def sections(text):
    """{節番号: (見出し, 本文)}。"## N. 見出し" で区切る"""
    out, cur = {}, None
    for line in text.splitlines():
        m = re.match(r"^##\s+(\d+)\.\s*(.*)$", line)
        if m:
            cur = int(m.group(1))
            out[cur] = [m.group(2).strip(), []]
        elif cur is not None:
            out[cur][1].append(line)
    return {k: (v[0], "\n".join(v[1]).strip()) for k, v in out.items()}


def lead_of(text):
    """題（# 〜）の次の段落（.md の文をそのまま使う）"""
    lines = text.splitlines()
    for i, l in enumerate(lines):
        if l.startswith("# "):
            for l2 in lines[i + 1:]:
                if l2.strip():
                    return l2.strip()
    return ""


def split_title(head):
    """見出しの長い括弧書きは、カードの題から外して本文の先頭に回す（文は変えず、そのまま出す）"""
    m = re.match(r"^([^（(]+)[（(](.*)[）)]\s*$", head)
    return (m.group(1).strip(), m.group(2).strip()) if m else (head, "")


LI_RE = re.compile(r"^(?:\d+\.|[-*])\s")


def fix_md(md):
    """文は変えず、Markdown の読み方だけ整える。
    ① 段落の直後に空行なしで始まる箇条書きを、箇条書きとして読ませる（空行を足す）
    ② 本文の先頭の「3. のどれにも…」のような、単独の番号つきの行は、番号の文として読ませる（リストにしない）"""
    lines = md.split("\n")
    out = []
    for i, l in enumerate(lines):
        if LI_RE.match(l) and out and out[-1].strip() and not LI_RE.match(out[-1]) and not out[-1].startswith((" ", "\t")):
            out.append("")
        if i == 0 and re.match(r"^\d+\.\s", l):
            nxt = next((x for x in lines[1:] if x.strip()), "")
            if not LI_RE.match(nxt) or not re.match(r"^\d+\.\s", nxt):
                l = re.sub(r"^(\d+)\.", r"\1\\.", l)
        out.append(l)
    return "\n".join(out)


def build(text, repo, commit):
    secs = sections(text)
    for n in SHOWN:
        if n not in secs:
            raise SystemExit(f"{SRC} に §{n} がありません")
    for n, words in FLOW_NEEDS.items():
        for w in words:
            if w not in secs[n][0] + secs[n][1]:
                raise SystemExit(f"{SRC} §{n} に「{w}」が無いので、流れ図が古い可能性があります。scripts/build-review-rule.py の図を見直してください")
    cards = []
    for n in SHOWN:
        title, extra = split_title(secs[n][0])
        md = (extra + "\n\n" if extra else "") + secs[n][1]
        flow = FLOW if n == 2 else ""
        cards.append(f'<section class="rr-card" id="s{n}"><h2><span class="no">{n}</span>{html.escape(title)}</h2>{flow}{bd5.render(fix_md(md))}</section>')
    short = commit[:7] if commit else "不明"
    blob = f"https://github.com/{repo}/blob/{commit}/{quote(SRC)}" if repo and commit else ""
    link = f'<a href="{blob}">{html.escape(SRC)}</a>' if blob else f"<code>{html.escape(SRC)}</code>"
    head = ('<!doctype html>\n<html lang="ja">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1">\n<meta name="color-scheme" content="light">\n'
            "<title>PR レビューのルール｜雷禅・黄泉・軀</title>\n"
            '<meta name="description" content="PR のレビュー・承認・マージの決まり（PRレビュー規定.md から自動で作られる）。">\n'
            '<meta name="theme-color" content="#2A1B3D">\n' + bd5.icon_links("") +
            '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
            '<link href="https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@500;800&display=swap" rel="stylesheet">\n'
            f'<link rel="stylesheet" href="kb/kb.css">\n<style>{CSS}</style>\n</head>\n<body>\n')
    page = (head +
            '<header class="kb-band"><div class="kb-in">\n<div class="kb-nav"><a href="hub.html">← 開発ハブ</a></div>\n'
            f'<h1>PR レビューのルール</h1>\n<p class="lead">{html.escape(lead_of(text))}</p>\n</div></header>\n'
            '<main class="kb">\n<p class="rr-lead">下の内容は <code>00_ルール/PRレビュー規定.md</code> の §2〜§6 です（要約せず、規定の文をそのまま出しています）。</p>\n'
            + "\n".join(cards) +
            f'\n<p class="src">元の規定: {link}<br>表示中のコミット: <code>{html.escape(short)}</code>（このページは .md から自動生成。直接は編集しません）</p>\n'
            '</main>\n<footer class="kb-foot"><a href="hub.html">← 開発ハブに戻る</a></footer>\n</body>\n</html>\n')
    return bd5.externalize(page)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="_site")
    a = ap.parse_args()
    repo, commit = bd5.repo_info()
    text = (ROOT / SRC).read_text(encoding="utf-8")
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    (out / "review-rule.html").write_text(build(text, repo, commit), encoding="utf-8")
    print(f"生成: {out}/review-rule.html commit={commit[:7] or '不明'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
