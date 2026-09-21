# POLARIS

AI-enabled Antarctic sea-ice, iceberg trajectory and navigation decision support for Smart India Hackathon **PS 26059** (MoES / NCPOR).

## Honest status (this machine, 2026-09-07)

| Piece | Status |
|---|---|
| BYU/NIC icebergs | **LIVE** — 38 named bergs scraped from scp.byu.edu |
| NSIDC ice grids | LIVE when Earthdata credentials are set |
| ERA5 wind/current | **LIVE** — CDS NetCDF `backend/data/cache/era5_latest.nc` (u10/v10); APScheduler ingest every `INGEST_INTERVAL_HOURS` |
| IceNet U-Net | Not loaded — persistence/climatology ensemble |
| Trajectory model | HybridIcebergLSTM (`backend/ml/lstm_weights.pt`) trained on merged real-historical BYU + physics-informed synthetic tracks. Historical training wind/current are parameterized, not dated ERA5. Live inference wind is current ERA5. See `DEVIATIONS.md`. |
| Docker Compose | Files present; Docker not required for local SQLite run |

See `DATA_SOURCES.md` and `DEVIATIONS.md`.

## Run locally (no Docker)

**IMPORTANT**: Always start the backend FIRST, then the frontend. The backend fetches live data on startup.

```bash
# Step 1: Start backend (fetches live BYU/NSIDC/ERA5 data on startup)
python -m venv .venv
.venv\Scripts\pip install fastapi "uvicorn[standard]" httpx beautifulsoup4 lxml sqlalchemy numpy apscheduler python-dotenv pydantic-settings
.venv\Scripts\python -m uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8000

# Step 2: Start frontend (in separate terminal)
cd frontend
npm install
npm run dev
```

**Correct backend startup command**: `python -m uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8000`

This command will:
- Initialize SQLite database
- Fetch live BYU/NIC iceberg data (38 bergs)
- Fetch live NSIDC sea ice grids (616 cells) 
- Fetch live ERA5 wind data (396 points)
- Start scheduled data refresh every 6 hours (configurable via INGEST_INTERVAL_HOURS)

**To use offline cached data only**: Set `OFFLINE_STARTUP=true` in `.env` file before starting backend.

- Simulator: http://localhost:9000/simulation  
- Overview map: http://localhost:9000  
- API: http://localhost:8000/health · `/api/icebergs/` · `/api/ice/forecast?day=3` · `POST /api/route/`  
  (also proxied at http://localhost:9000/api/...)

## Docker (when Docker Desktop is available)

```bash
cp .env.example .env
docker compose up --build
```

Services: postgres (PostGIS), redis, backend, frontend, nginx.

## Demo script

1. Overview: ice heatmap + forecast day slider in the 3D view.  
2. Named bergs (A76C, A81, A83, …) with 24/48/72h paths.  
3. Click map → three routes. Lock one.  
4. Open simulator; locked route is the green dotted line.  
5. Engage autonomous.  
6. Recalculate / trajectory update fires an INFO alert.  
7. Detection log fills near icebergs.  
8. Close approach → CRITICAL banner. Override to manual (toggle autonomous off).  
9. Export mission PDF.  
10. Point judges at the Data Reality badge / `DATA_SOURCES.md`.
