# Architecture (production reference)

This demo runs the **API + Dashboard** only against CSV files. In production,
the system has the following four backend services plus the dashboard.

## High-level data flow

```
  News sites (RSS, sitemaps,           PostgreSQL
   listing pages)                      ├─ sources
        │                              ├─ discovered_urls
        ▼                              ├─ articles
   ┌─────────┐    URLs    ┌─────────┐  └─ trends/articles cache
   │   CLT   │───────────▶│   SCR   │
   │discovery│            │ scraping│──┐
   └─────────┘            └─────────┘  │  parsed content
                                        ▼
                                  ┌─────────┐
                                  │   TAG   │  zero-shot classifier
                                  │  AI     │  Korean topic anchors
                                  │ tagging │  language detection
                                  └────┬────┘
                                       │  scored articles
                                       ▼
                                  ┌─────────┐    HTTP
                                  │   API   │◀────── ┌──────────┐
                                  │ FastAPI │        │Dashboard │
                                  └─────────┘        │React+Vite│
                                                     │Leaflet   │
                                                     │Recharts  │
                                                     └──────────┘
```

## Services

### CLT — URL Discovery
Reads per-country source registries, polls feeds and sitemaps on independent
cadences, writes new URLs to `discovered_urls` / `discovered_urls2`. Failures
are recorded with a status code and treated as routine, not exceptions.

### SCR — Scraping & Normalization
Picks pending URLs from the queue. Two-stage parser: `trafilatura` primary,
`newspaper3k` fallback. Filter chain rejects paywalls, JS-only pages, and
duplicates. Detects language with `fasttext`. Writes normalized article rows.

### TAG — AI Tagging
Three independent passes per article:
- AI relevance score (zero-shot via `sentence-transformers`)
- Topic primary + topic_scores array (zero-shot multi-label)
- Korean topic detector built on anchor phrases (`run_topics_kr.py`)

Each pass writes to its own column so shadow versions can run side-by-side.

### API — FastAPI
Exposes `/api/articles` and `/api/trends/kr` to the dashboard. Backed by a
psycopg connection pool with a DB-backed read-through cache for the
expensive trends aggregation.

## Dashboard

React 19 + Vite 7 SPA:
- `MapView` — Leaflet world map with markers sized by article volume
- `KoreaTrends` — Recharts area chart of weekly topic mixture for Korean sources
- `NewsPanel` — virtualized list of articles with filters
- `PageShell`, `ErrorBoundary` — shared layout + crash handling

Served from a multi-stage Node→nginx Docker image.

## What this demo skips

| Production | Demo |
|---|---|
| PostgreSQL | CSV files in `backend/app/data/` |
| CLT URL discovery service | Skipped — data is pre-extracted |
| SCR scraping service | Skipped — data is pre-extracted |
| TAG tagging service | Skipped — tags are baked into the CSV |
| Read-through cache | Skipped — pandas is fast enough at demo scale |
| Authentication | Skipped — demo is open |
| Country diversity logic | Same algorithm, in pandas |
| Weekly trends aggregation | Same algorithm, in pandas (no SQL window functions) |

## How the demo data was produced

The CSVs in `backend/app/data/` are a small sanitized sample (~400 articles,
~188 sources) exported via `psql \COPY` from the production PostgreSQL,
filtered to `ai_score >= 0.5` and articles with non-null `topic_scores`. No
credentials, internal IPs, or proprietary source registry are included.
