# reason_templates.py — 理由の文のひな形の表（設計.md D-03、N-14）。文言を直すときはこのファイルだけ。
# 行ごとに ID・条件・文片。組み立ては reasons.py（文言は書かない）。
from typing import NamedTuple


class Template(NamedTuple):
    id: str
    condition: str
    fragment: str


# SP-03 D-03
TEMPLATES: tuple[Template, ...] = (
    Template("TPL-01", "送別回数 n≧1 かつ、評価の文があり評価4.5以上（つなぐ）", "職場の送別で{n}回選ばれていて、"),
    Template("TPL-02", "送別回数 n≧1 で、TPL-01 に当てはまらない", "職場の送別で{n}回選ばれています。"),
    Template("TPL-03", "送別回数 n＝0（0 でも出す）", "職場の送別での購入は、まだありません。"),
    Template("TPL-04", "評価・件数あり、v≧1、r≧4.5、つなぐとき", "評価も{r}（{v}件）と高めです。"),
    Template("TPL-05", "評価・件数あり、v≧1、r≧4.5、つなぐときでない（n＝0）", "評価は{r}（{v}件）と高めです。"),
    Template("TPL-06", "評価・件数あり、v≧1、r＜4.5", "評価は{r}（{v}件）です。"),
    Template("TPL-07", "配送日数あり・ラッピング可", "{d}日で届き、ラッピングもできます。"),
    Template("TPL-08", "配送日数あり・ラッピング不可／値なし", "{d}日で届きます。"),
    Template("TPL-09", "配送日数なし・ラッピング可", "ラッピングができます。"),
)
# 評価の文なし（評価か件数が無い、または件数0）・配送日数なしでラッピング可でない場合は、文を入れない。

BY_ID: dict[str, str] = {t.id: t.fragment for t in TEMPLATES}
