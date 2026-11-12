# share_id.py — 共有リンクの識別子を作る（設計.md DATA-02、N-02、SP-05、D-05・D-07）
# 暗号用の乱数から作る推測できない 22 文字（英大文字・英小文字・数字・「-」「_」）。連番にしない。
import re
import secrets

SHARE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{22}$")  # D-06 の形式と同じ


# SP-05 D-05 D-07 N-02
def new_share_id() -> str:
    """毎回新しい識別子を返す。secrets.token_urlsafe(16) は URL に安全な 22 文字を返す"""
    return secrets.token_urlsafe(16)
