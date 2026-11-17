# config.py — 変えうる値を 1 か所に集める（設計.md N-14・D-23）
# 仕様で決まった値だけ。環境ごとに変わる値・秘匿値（接続情報など）は環境変数（N-04・N-07）で、ここには置かない。
# 変更不可（frozen）。環境変数・リクエストからは変えられない（E-14）。
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    BAYES_K: int = 20  # SP-02 ベイズ平均の係数
    CANDIDATE_PAGE_SIZE: int = 12  # SP-01・SP-15・N-14 R-01 の1ページの件数（旧 TOP_N＝上位10件。PM 決定 2026-11-17「1A」。#418）
    HIGH_RATING_MIN: float = 4.5  # SP-03 高評価の基準
    BUDGET_MIN: int = 1000  # SP-01、#31
    BUDGET_MAX: int = 999999  # SP-01、#31
    SHARE_MAX_ITEMS: int = 10  # SP-05、N-06 共有リンクに入れられる件数
    SHARE_EXPIRY_HOURS: int = 720  # SP-06 共有リンクの有効時間
    SHARE_ID_LENGTH: int = 22  # SP-05 共有リンクの識別子の長さ
    REQUEST_TIMEOUT_SECONDS: int = 10  # #29-14 サーバーの DB 問い合わせの上限（E-13）
    PAGE_SIZE: int = CANDIDATE_PAGE_SIZE  # D-28・N-14 R-02 の1ページの件数。R-01 と同じ値（12 は上の 1 か所だけ。NF-31）
    DB_IDLE_MAX: int = 4  # D-45 残しておく DB 接続の本数（3〜4 本。詳細の画面の 3 つの API が同時に使う）
    LIKE_MAX_PER_ITEM: int = 30  # N-17・D-39 1 共有リンク × 1 候補のいいねの上限
    EVENT_BODY_MAX_BYTES: int = 1024  # D-40 計測の本文の上限（1KB）
    TEST_KEY_MAX_LENGTH: int = 64  # D-40・K-5 本文の test_key の長さの上限（合言葉の値はここに置かない。環境変数 GIFTIA_TEST_KEY）
    SEARCH_Q_MAX_LENGTH: int = 50  # D-49・SP-35 検索の言葉の長さの上限（決定。PM 11/15）
    SEARCH_MIN_SCORE: int = 85  # D-49 決定 17 近さの下限（rapidfuzz partial_ratio。決定（I-62 で決めた。D-49））
    VOICES_MAX: int = 2  # SP-17・D-35 贈った人の声の最大件数
    VOICE_MIN_RATING: int = 4  # SP-17・D-35 声に使う星の下限（4 以上）
    SHARE_REQUEST_MAX_LENGTH: int = 50  # N-06 重複込みの配列の長さの上限（決定。キックオフ記録 76）


SETTINGS = Settings()
