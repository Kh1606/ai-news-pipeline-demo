from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Query

from app.repository import KR_SOURCE_IDS, weekly_topic_trends

router = APIRouter()


@router.get("/trends/kr")
def trends_kr(
    start: str = Query("2025-01-01"),
    end: Optional[str] = Query(None),
    min_primary: float = Query(0.4),
    min_topic: float = Query(0.4),
    min_ai: float = Query(0.5),
    score_version: str = Query("v2", pattern="^(v1|v2)$"),
):
    return weekly_topic_trends(
        source_ids=KR_SOURCE_IDS,
        start_date=start,
        end_date=end,
        min_topic_score=min_topic,
        min_primary_score=min_primary,
        min_ai_score=min_ai,
        score_version=score_version,
    )
