# search.py — GET /api/products の q（言葉で探す）。設計.md D-49、仕様 SP-35。外部の AI は使わない。
#  ① 正規化（NFKC＋jaconv。全角・半角・ひらがな・カタカナ・大文字・小文字・前後の空白をそろえる）
#  ② 言い換え表（rephrase.py。言葉が表の左の言葉を含むとき、右の言葉も探す）
#  ③ rapidfuzz（言葉と「商品名＋カテゴリー」の文字の近さ。partial_ratio。下限 SETTINGS.SEARCH_MIN_SCORE）
#  - 言葉は SQL に連結しない（N-04）。この部品は DB を呼ばず、受け取った商品の行だけを見る。
#  - 言葉をログにも計測にも残さない（決定 18）。この部品はログを出さない。例外にも言葉を入れない。
#  - 正規化した「商品名＋カテゴリー」は、最初に使ったときに 1 回だけ作ってメモリに置く（索引。DB の読み取りは今までの SELECT だけ）。
import unicodedata
from collections.abc import Sequence
from typing import Any

import jaconv
from rapidfuzz import fuzz, process

from config import SETTINGS
from rephrase import REPHRASE


def normalize(text: str) -> str:
    """全角と半角・ひらがなとカタカナ・大文字と小文字・前後の空白をそろえる"""
    return jaconv.kata2hira(unicodedata.normalize("NFKC", text)).lower().strip()


_RULES: tuple[tuple[str, tuple[str, ...]], ...] = tuple(
    (normalize(key), tuple(normalize(w) for w in words)) for key, words in REPHRASE.items()
)
_INDEX: dict[str, str] = {}  # 「商品名\0カテゴリー」→ 正規化した探す文字列（最初の検索で作る。商品は約 7,766 件）


def parse_q(raw: str | None) -> list[str] | None | str:
    """q の検査。言葉なし（無い・空・空白だけ）は None、50 文字を超えたら "too_long"、それ以外は正規化した言葉の並び（重複なし）"""
    if raw is None:
        return None
    stripped = raw.strip()
    if stripped == "":
        return None
    if len(stripped) > SETTINGS.SEARCH_Q_MAX_LENGTH:
        return "too_long"
    words = list(dict.fromkeys(normalize(stripped).split()))
    return words or None


def expand(word: str) -> list[str]:
    """言葉と、言い換え表で広がった言葉（表の左の言葉を、言葉が含むとき）"""
    out = [word]
    for key, words in _RULES:
        if key in word:
            out.extend(w for w in words if w not in out)
    return out


def _haystack(name: str, category: str) -> str:
    key = f"{name}\0{category}"
    text = _INDEX.get(key)
    if text is None:
        text = normalize(name) + " " + normalize(category)
        _INDEX[key] = text
    return text


def match(words: Sequence[str], rows: Sequence[dict[str, Any]]) -> dict[int, tuple[int, float]]:
    """行の番号 → (合う言葉の数, 近さの点)。合う言葉が 1 つも無い行は含めない。
    言葉ごとに、言葉と言い換えた言葉のうち一番近い点を取り、下限以上なら「合う」。近さの点は合った言葉の点の合計"""
    docs = [_haystack(str(r["product_name"]), str(r["category"])) for r in rows]
    floor = SETTINGS.SEARCH_MIN_SCORE
    result: dict[int, tuple[int, float]] = {}
    for word in words:
        best: dict[int, float] = {}
        for term in expand(word):
            for _, score, idx in process.extract(term, docs, scorer=fuzz.partial_ratio, score_cutoff=floor, limit=None):
                if score > best.get(idx, 0.0):
                    best[idx] = score
        for idx, score in best.items():
            n, close = result.get(idx, (0, 0.0))
            result[idx] = (n + 1, close + score)
    return result
