# reason_templates.py — 理由の文のひな形の表（設計.md D-03、N-14）。文言を直すときはこのファイルだけ。
# 行ごとに ID・条件・文片。組み立ては reasons.py（文言は書かない）。
from typing import NamedTuple


class Template(NamedTuple):
    id: str
    condition: str
    fragment: str


# SP-03 D-03
TEMPLATES: tuple[Template, ...] = (
    Template("TPL-01", "選んだシーンの回数 n≧1 かつ、評価の文があり評価4.5以上（つなぐ）", "{head}{n}回選ばれていて、"),
    Template("TPL-02", "選んだシーンの回数 n≧1 で、TPL-01 に当てはまらない", "{head}{n}回選ばれています。"),
    # TPL-03（回数 0 の文「…での購入は、まだありません。」）は第2弾で取りやめ（SP-03。PM 11/15）。0 回は回数の文を出さず、評価の文から始める
    Template("TPL-04", "評価・件数あり、v≧1、r≧4.5、つなぐとき", "評価も{r}（{v}件）と高めです。"),
    Template("TPL-05", "評価・件数あり、v≧1、r≧4.5、つなぐときでない（n＝0 を含む）", "評価は{r}（{v}件）と高めです。"),
    Template("TPL-06", "評価・件数あり、v≧1、r＜4.5", "評価は{r}（{v}件）です。"),
    Template("TPL-07", "配送日数あり・ラッピング可", "{d}日で届き、ラッピングもできます。"),
    Template("TPL-08", "配送日数あり・ラッピング不可／値なし", "{d}日で届きます。"),
    Template("TPL-09", "配送日数なし・ラッピング可", "ラッピングができます。"),
)
# 文の頭 {head}（SP-03 第2弾）: 選んだシーンに合わせる。共有リンクに保存済みの第1弾の文は変えない
SCENE_HEADS: dict[str, str] = {"送別": "職場の送別で", "お礼": "お礼で", "誕生日": "誕生日で"}
# 評価の文なし（評価か件数が無い、または件数0）・配送日数なしでラッピング可でない場合は、文を入れない。

BY_ID: dict[str, str] = {t.id: t.fragment for t in TEMPLATES}
