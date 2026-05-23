from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Query

from app.repository import list_articles

router = APIRouter()


@router.get("/articles")
def get_articles(
    min_ai_score: float = Query(0.5),
    limit: int = Query(200, ge=1, le=2000),
    score_version: str = Query("v2", pattern="^(v1|v2)$"),
    lang: Optional[str] = Query(None),
    source_id: Optional[str] = Query(None),
    country_code: Optional[str] = Query(None),
    max_per_country: int = Query(8, ge=1, le=100),
):
    return list_articles(
        min_ai_score=min_ai_score,
        limit=limit,
        score_version=score_version,
        lang=lang,
        source_id=source_id,
        country_code=country_code,
        max_per_country=max_per_country,
    )
