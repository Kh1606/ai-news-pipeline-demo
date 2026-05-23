"""Pre-render the API responses to static JSON files for the production build.

Reads CSVs via the same backend repository.py used at runtime, calls the
endpoint handlers with their default parameters, and writes the results to
frontend/public/api/ so Cloudflare Pages can serve them as a static site.

Run from the repo root after the backend venv is set up:

    python scripts/generate_static_api.py

Refresh whenever the CSVs change.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "backend"))

from app.repository import KR_SOURCE_IDS, list_articles, weekly_topic_trends


OUT_DIR = REPO_ROOT / "frontend" / "public" / "api"
TRENDS_DIR = OUT_DIR / "trends"


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    TRENDS_DIR.mkdir(parents=True, exist_ok=True)

    articles = list_articles(
        min_ai_score=0.5,
        limit=200,
        score_version="v2",
        max_per_country=8,
    )
    (OUT_DIR / "articles.json").write_text(
        json.dumps(articles, ensure_ascii=False),
        encoding="utf-8",
    )
    print(f"wrote {len(articles)} articles -> {OUT_DIR / 'articles.json'}")

    trends = weekly_topic_trends(
        source_ids=KR_SOURCE_IDS,
        start_date="2025-01-01",
        end_date=None,
        min_topic_score=0.4,
        min_primary_score=0.4,
        min_ai_score=0.5,
        score_version="v2",
    )
    (TRENDS_DIR / "kr.json").write_text(
        json.dumps(trends, ensure_ascii=False),
        encoding="utf-8",
    )
    print(f"wrote {len(trends.get('weeks', []))} weeks -> {TRENDS_DIR / 'kr.json'}")


if __name__ == "__main__":
    main()
