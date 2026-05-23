# AI News Pipeline — Demo

A small full-stack demo: collect, tag, and visualize global AI-related news.

This is a **personal, runnable demo** — a stripped-down version of a production
system I built. The data here is a small CSV sample (~400 articles, ~188
sources); the database, scraping pipeline, and ML tagging service are
documented in [`docs/architecture.md`](docs/architecture.md) but not
implemented in this repo.

## What you get when you run it

- **FastAPI backend** that serves `/api/articles` and `/api/trends/kr` from CSVs
- **React 19 + Vite 7 dashboard** with:
  - Leaflet world map of news sources sized by article volume
  - Recharts weekly topic-trend chart for Korean sources
  - Filterable news panel with topic + language tags

## Quick start (no Docker)

**Backend** (terminal 1):

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS/Linux
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

**Frontend** (terminal 2):

```bash
cd frontend
npm install
npm run dev
```

Then open **http://localhost:5174**.

## Quick start (Docker)

```bash
docker compose up --build
```

Then open **http://localhost:8080**.

## Architecture

In production the system has four backend services (URL discovery, scraping,
AI tagging, API) over PostgreSQL, with this React dashboard on top. This demo
implements only the API + dashboard, reading from pre-extracted CSV samples.

See [`docs/architecture.md`](docs/architecture.md) for the full picture.

## Repository layout

```
ai-news-pipeline-demo/
├── backend/                # FastAPI + pandas (no DB)
│   ├── app/
│   │   ├── main.py
│   │   ├── routes/         # /api/articles, /api/trends/kr
│   │   ├── repository.py   # CSV-backed data access
│   │   └── data/           # articles.csv + sources.csv
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/               # React 19 + Vite 7 + Leaflet + Recharts
├── docs/
│   └── architecture.md     # full production architecture description
├── docker-compose.yml
├── LICENSE                 # MIT
└── README.md
```

## License

MIT — see [LICENSE](LICENSE).
