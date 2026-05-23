from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.articles import router as articles_router
from app.routes.trends import router as trends_router


app = FastAPI(title="AI News Pipeline (Demo)", version="0.1.0")

_DEFAULT_ORIGINS = "http://localhost:5174,http://localhost:5173"
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get("DEMO_CORS_ORIGINS", _DEFAULT_ORIGINS).split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(articles_router, prefix="/api")
app.include_router(trends_router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok"}
