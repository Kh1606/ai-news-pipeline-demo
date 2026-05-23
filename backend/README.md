# Backend — AI News Pipeline (Demo)

FastAPI service that serves articles and weekly trends from CSV files
(no database in this demo — production uses PostgreSQL).

## Run locally

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS/Linux
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Then open http://127.0.0.1:8000/docs for the OpenAPI UI.

## Endpoints

- `GET /health`
- `GET /api/articles?min_ai_score=0.5&limit=60&score_version=v2`
- `GET /api/trends/kr?start=2025-01-01&min_ai=0.5&score_version=v2`

## Data

- `app/data/articles.csv` — ~400 sample articles
- `app/data/sources.csv` — ~188 source identifiers with country + lat/lon

In production these would come from PostgreSQL (see [docs/architecture.md](../docs/architecture.md)).
