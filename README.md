# AI News Pipeline — Demo

A small full-stack demo: collect, tag, and visualize global AI-related news.

**🌐 Live demo:** **<https://ai-news-pipeline-demo.azimjon1606.workers.dev>**

This is a **personal, runnable demo** — a stripped-down version of a production
system I built. The data here is a small CSV sample (~1500 articles, ~188
sources); the database, scraping pipeline, and ML tagging service are
documented in [`docs/architecture.md`](docs/architecture.md) but not
implemented in this repo.

## What you get

- **React 19 + Vite 7 dashboard** with:
  - Leaflet world map of news sources sized by article volume
  - Recharts weekly topic-trend chart for Korean sources
  - Filterable news panel with topic + language tags
- **FastAPI backend** (for local dev) that serves `/api/articles.json` and
  `/api/trends/kr.json` from CSVs. In production the same JSON files are
  pre-rendered at build time and served as static assets by Cloudflare —
  no running backend needed.

## Run it locally

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

## Deployment

The site deploys as a fully static build to **Cloudflare Workers (Static Assets)**.
There is no running backend in production — the `/api/*.json` responses are
pre-rendered at build time and served as static files.

- Config: [`wrangler.jsonc`](wrangler.jsonc) tells the Worker to serve from
  `./frontend/dist` with SPA fallback for unknown paths.
- Build command (set in Cloudflare dashboard):
  `cd frontend && npm install && npm run build`
- Deploy command: `npx wrangler deploy`
- Cloudflare auto-deploys on every push to `main`.

To refresh the data (after editing the CSVs):

```bash
cd backend
.venv\Scripts\activate          # or `source .venv/bin/activate`
python ../scripts/generate_static_api.py
```

This regenerates `frontend/public/api/articles.json` and
`frontend/public/api/trends/kr.json`. Commit and push — the next deploy picks
them up.

## License

MIT — see [LICENSE](LICENSE).
