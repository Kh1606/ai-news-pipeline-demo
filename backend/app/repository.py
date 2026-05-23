"""CSV-backed replacement for the production storage layer.

Loads articles.csv + sources.csv at import time. All queries operate
in-memory via pandas. Demo-scale only.
"""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd


DATA_DIR = Path(__file__).parent / "data"


def _md5_hash(text: str) -> str:
    return hashlib.md5(text.encode("utf-8")).hexdigest()


def _load_sources() -> pd.DataFrame:
    df = pd.read_csv(DATA_DIR / "sources.csv")
    return df


def _load_articles() -> pd.DataFrame:
    df = pd.read_csv(
        DATA_DIR / "articles.csv",
        parse_dates=["scraped_at", "published_at"],
    )
    df["topic_scores_parsed"] = df["topic_scores"].apply(
        lambda x: json.loads(x) if isinstance(x, str) and x.strip() else []
    )
    df["url_hash"] = df["url"].apply(_md5_hash)
    return df


SOURCES = _load_sources()
ARTICLES = _load_articles()


def _coalesce_ai_score(row: pd.Series, score_version: str) -> Optional[float]:
    if score_version == "v1":
        for col in ("ai_score_zs", "ai_score"):
            v = row.get(col)
            if v is not None and not (isinstance(v, float) and math.isnan(v)):
                return float(v)
        return None
    for col in ("ai_score_zs_v2", "ai_score_zs", "ai_score"):
        v = row.get(col)
        if v is not None and not (isinstance(v, float) and math.isnan(v)):
            return float(v)
    return None


def _row_to_article_dict(row: pd.Series) -> Dict[str, Any]:
    source_row = SOURCES.loc[SOURCES["source_id"] == row["source_id"]]
    source_name = row["source_id"]
    country_code = None
    lat = None
    lon = None
    if not source_row.empty:
        s = source_row.iloc[0]
        source_name = s["display_name"]
        country_code = s["country_code"]
        lat = float(s["lat"]) if pd.notna(s["lat"]) else None
        lon = float(s["lon"]) if pd.notna(s["lon"]) else None

    def _to_iso(value):
        if value is None or pd.isna(value):
            return None
        return value.isoformat() if hasattr(value, "isoformat") else str(value)

    def _to_float(value):
        if value is None or pd.isna(value):
            return None
        return float(value)

    def _to_str_or_none(value):
        if value is None or pd.isna(value):
            return None
        return str(value)

    return {
        "url_hash": row["url_hash"],
        "source_id": row["source_id"],
        "source_name": source_name,
        "country_code": country_code,
        "lat": lat,
        "lon": lon,
        "url": row["url"],
        "title": _to_str_or_none(row["title"]),
        "image_url": None,
        "excerpt": None,
        "published_at": _to_iso(row["published_at"]),
        "scraped_at": _to_iso(row["scraped_at"]),
        "lang": _to_str_or_none(row.get("lang")),
        "ai_score": _to_float(row.get("ai_score_zs_v2")) or _to_float(row.get("ai_score_zs")) or _to_float(row.get("ai_score")),
        "ai_score_zs": _to_float(row.get("ai_score_zs")),
        "ai_score_zs_v2": _to_float(row.get("ai_score_zs_v2")),
    }


def list_articles(
    *,
    min_ai_score: float = 0.5,
    limit: int = 200,
    score_version: str = "v2",
    lang: Optional[str] = None,
    source_id: Optional[str] = None,
    country_code: Optional[str] = None,
    max_per_country: int = 8,
) -> List[Dict[str, Any]]:
    df = ARTICLES.copy()
    df["effective_ai"] = df.apply(lambda r: _coalesce_ai_score(r, score_version), axis=1)
    df = df[df["effective_ai"].notna() & (df["effective_ai"] >= min_ai_score)]

    if lang:
        df = df[df["lang"] == lang]
    if source_id:
        df = df[df["source_id"] == source_id]
    if country_code:
        valid_sources = SOURCES.loc[SOURCES["country_code"] == country_code, "source_id"]
        df = df[df["source_id"].isin(valid_sources)]

    df["sort_ts"] = df["published_at"].fillna(df["scraped_at"])
    df = df.sort_values("sort_ts", ascending=False)

    selected: List[Dict[str, Any]] = []
    country_counts: Dict[str, int] = {}
    overflow: List[Dict[str, Any]] = []

    for _, row in df.iterrows():
        item = _row_to_article_dict(row)
        cc = item.get("country_code") or "_unknown"
        if country_counts.get(cc, 0) < max_per_country:
            selected.append(item)
            country_counts[cc] = country_counts.get(cc, 0) + 1
        else:
            overflow.append(item)
        if len(selected) >= limit:
            break

    if len(selected) < limit:
        for item in overflow:
            selected.append(item)
            if len(selected) >= limit:
                break

    return selected[:limit]


def weekly_topic_trends(
    *,
    source_ids: List[str],
    start_date: str = "2025-01-01",
    end_date: Optional[str] = None,
    min_topic_score: float = 0.4,
    min_primary_score: float = 0.4,
    min_ai_score: float = 0.5,
    score_version: str = "v2",
) -> Dict[str, Any]:
    """Pandas-backed replica of production trends aggregation.

    Implements 'score_share' / 'ai_scaled' weighting:
      - each article contributes a credit scaled from its AI score
      - credit is split across topics by normalized topic_scores
    """
    df = ARTICLES.copy()
    df = df[df["source_id"].isin(source_ids)]
    df["effective_ai"] = df.apply(lambda r: _coalesce_ai_score(r, score_version), axis=1)
    df = df[df["effective_ai"].notna()]
    df["effective_ai"] = df["effective_ai"].astype(float)
    df = df[df["effective_ai"] >= min_ai_score]
    df = df[df["topic_primary_score"].notna() & (df["topic_primary_score"] >= min_primary_score)]

    df["ts"] = df["published_at"].fillna(df["scraped_at"])
    df = df[df["ts"].notna()]

    start_ts = pd.Timestamp(start_date, tz="UTC")
    if df["ts"].dt.tz is None:
        start_ts = start_ts.tz_localize(None)
    df = df[df["ts"] >= start_ts]
    if end_date:
        end_ts = pd.Timestamp(end_date, tz="UTC")
        if df["ts"].dt.tz is None:
            end_ts = end_ts.tz_localize(None)
        df = df[df["ts"] < end_ts]

    expanded_rows: List[Dict[str, Any]] = []
    for _, row in df.iterrows():
        ai = float(row["effective_ai"])
        ai_scaled = max(0.0, min(1.0, (ai - min_ai_score) / max(1e-9, 1.0 - min_ai_score)))
        topics = row["topic_scores_parsed"]
        valid_topics = [(t["topic"], float(t["score"])) for t in topics if float(t["score"]) >= min_topic_score]
        if not valid_topics:
            continue
        denom = sum(score for _, score in valid_topics)
        if denom <= 0:
            continue
        week_start = row["ts"].to_period("W-SUN").start_time.date().isoformat()
        week_label = row["ts"].strftime("%G-W%V")
        for topic, score in valid_topics:
            expanded_rows.append({
                "id": row["id"],
                "week_start": week_start,
                "week_label": week_label,
                "topic": topic,
                "points": ai_scaled * (score / denom),
            })

    if not expanded_rows:
        return {
            "meta": {
                "start_date": start_date,
                "end_date": end_date,
                "min_primary_score": float(min_primary_score),
                "min_topic_score": float(min_topic_score),
                "min_ai_score": float(min_ai_score),
                "method": "score_share",
                "weight_mode": "ai_scaled",
                "ts_basis": "published_at_or_scraped",
                "score_version": score_version,
            },
            "weeks": [],
        }

    exp_df = pd.DataFrame(expanded_rows)
    grouped = exp_df.groupby(["week_start", "week_label", "topic"], as_index=False)["points"].sum()
    week_totals = exp_df.groupby(["week_start", "week_label"], as_index=False)["points"].sum().rename(columns={"points": "total_points"})
    week_counts = exp_df.groupby(["week_start", "week_label"], as_index=False)["id"].nunique().rename(columns={"id": "article_count"})

    grouped = grouped.merge(week_totals, on=["week_start", "week_label"])
    grouped = grouped.merge(week_counts, on=["week_start", "week_label"])
    grouped["share"] = grouped["points"] / grouped["total_points"]

    by_week: Dict[str, Dict[str, Any]] = {}
    for _, r in grouped.iterrows():
        key = r["week_label"]
        wk = by_week.setdefault(
            key,
            {
                "week_start": r["week_start"],
                "week_label": r["week_label"],
                "article_count": int(r["article_count"]),
                "topics": [],
            },
        )
        wk["topics"].append({
            "topic": r["topic"],
            "points": round(float(r["points"]), 4),
            "share_pct": round(float(r["share"]) * 100.0, 2),
        })

    for wk in by_week.values():
        wk["total_points"] = round(sum(t["points"] for t in wk["topics"]), 4)
        wk["topics"].sort(key=lambda x: x["points"], reverse=True)

    weeks = sorted(by_week.values(), key=lambda x: x["week_start"])
    return {
        "meta": {
            "start_date": start_date,
            "end_date": end_date,
            "min_primary_score": float(min_primary_score),
            "min_topic_score": float(min_topic_score),
            "min_ai_score": float(min_ai_score),
            "method": "score_share",
            "weight_mode": "ai_scaled",
            "ts_basis": "published_at_or_scraped",
            "score_version": score_version,
        },
        "weeks": weeks,
    }


KR_SOURCE_IDS = [
    "mk_kr", "etnews_kr", "hankyung_kr", "venturesquare_kr",
    "naver_d2_kr", "toss_tech_kr", "woowahan_kr", "kakaoenterprise_kr",
    "kurly_kr", "devsisters_kr", "line_engineering_kr", "coupang_engineering_kr",
    "daangn_kr", "zigbang_kr", "watcha_kr", "musinsa_kr", "banksalad_kr",
    "hyperconnect_kr", "yogiyo_kr", "socar_kr", "ridi_kr", "nhn_toast_kr",
    "geeknews_kr", "gaerae_kr", "44bits_kr",
    "kakaoenterprise_kr_nonrss", "naver_d2_kr_nonrss", "geeknews_kr_nonrss",
    "toss_tech_kr_nonrss", "woowabros_github_kr_nonrss",
    "ncsoft_danbi_works_kr_nonrss", "ncsoft_danbi_study_kr_nonrss",
    "line_engineering_kr_nonrss", "ahnlab_asec_kr_nonrss", "banksalad_kr_nonrss",
]
