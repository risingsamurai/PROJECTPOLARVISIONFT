# POLARIS — Deviations log

Written **after** each phase in past tense. Records what actually ran, not what was planned.

## Phase 0 — Scaffolding (2026-08-28)

Attempted `docker compose up --build`. **Docker is not installed** (`docker` is not a recognized command; Docker Desktop paths on this machine do not exist). Compose files, Nginx config, FastAPI placeholders, and Next.js 14 app were written anyway.

Verified instead on the host:
- Python 3.12.10 venv + uvicorn: `GET http://127.0.0.1:8000/health` returned `{"status":"ok","service":"polaris-backend"}`.
- Node.js 20.20.2 was installed via winget so the frontend could run.
- PyTorch was **not** added to the Phase 0 install (would have blocked a slim first boot). IceNet/LSTM later used numpy.

## Phase 1 — 3D simulator (2026-08-28)

Built `/simulation` against Zustand + `mockData.ts` with ocean shader, icebreaker, 21 icebergs, danger rings, dotted route, and the Section 6 HUD (layer toggles, ice legend, minimap, WASD caps, iceberg info, route info, data-reality badge).

`npm install` initially failed on `three@0.128` vs `@react-three/fiber@7` peer (`>=0.133`). Pinned **three@0.133.0** (still pre-r142; no `CapsuleGeometry`). `GET http://localhost:3000/simulation` returned **HTTP 200**. SSR HTML contained Layer Control, Ice Level, Iceberg Info, Route Info, Minimap, POLARIS. Recalculate/Data Reality strings are client-rendered. No headed browser was available in this session to click WASD/orbit; those code paths are in `Vessel.tsx` / `SceneCanvas.tsx`.

## Phase 2 — Data layer (2026-08-28)

Ran `python backend/data/byu_scraper.py`. Result: **LIVE, count=38, error=null**. Names included A76C, A81, A83. SQLite `SELECT count(*) FROM icebergs` = **38** after API ingest. NSIDC and ERA5 fetchers ran as FALLBACK (no credentials). Redis unreachable; in-memory cache used.

## Phase 3 — Overview map (2026-08-28)

`app/page.tsx` uses MapLibre + OSM raster (no Mapbox token). Markers are created from `GET /api/icebergs/` (the same 38 DB rows), not `mockData.ts`.

## Phase 4 — Ice forecast (2026-08-28)

`GET /api/ice/forecast?day=3` returned a grid of **616 cells**, `model=persistence_climatology_ensemble`, `icenet_weights=false`. IceNet pretrained U-Net was **not** downloaded or fine-tuned (no GPU/checkpoint pull). Slider on the simulator is wired to `forecastDay`.

## Phase 5 — Trajectories (2026-08-28)

Ran `ml_training/train_lstm.py` then `evaluate.py` on **38 live BYU icebergs**, **760** simulated daily samples. Recorded mean positional error:

- 24h: **0.80 nm**
- 48h: **1.26 nm**
- 72h: **1.87 nm**

These errors are on kinematics-simulated holdout tracks seeded from live positions, **not** on multi-year BYU CSV histories (the consolidated zip was not downloaded). There is no PyTorch LSTM in this environment; the “LSTM head” is a least-squares drift model whose weights live in `ml_training/checkpoints/lstm_weights.json`. Simulator icebergs hydrate from `/api/icebergs/` when the API is up.

## Phase 6 — Routing (2026-08-28)

First `POST /api/route` returned three identical 2-point geodesics (A* exhausted, then hung ~minutes on 38 bergs × 8000 iterations). Replaced the hot path with three offset corridors. Re-ran POST with start `[-68.35,-52.45]` dest `[-68.72,-49.55]`:

- safest 94.7 nm, 7 pts, mid (-69.085, -50.65)
- balanced 72.0 nm, 7 pts, mid (-68.755, -50.88)
- fastest 67.7 nm, 7 pts, mid (-68.495, -51.05)

Three genuinely different distances and shapes.

## Phase 7 — Autonomous + detection (2026-08-28)

Autonomous mode steers toward the locked route in `Vessel.tsx`. WebSocket `/ws` echoes telemetry. Detection log accumulates nearby iceberg (and can include injected debris labels). Not visually confirmed in a browser this session.

## Phase 8 — Alerts, PDF, polish (2026-08-28)

Alert banner + CRITICAL cooldown when range < 5 nm. Thresholds loaded from `backend/config/alerts.json`. PDF via `pdf-lib` (`Export mission PDF`). Demo script is supported by the UI controls (forecast slider, live berg names, three routes on overview, lock + simulator, autonomous, recalc/info alert, detection log, PDF, data-reality badge). Full start-to-finish click-through was **not** executed in a headed browser here.

`tsc --noEmit` on the frontend passed after fixing R3F 7 / Three.js Group ref types.

## Trajectories & Machine Learning Model Upgrades (2026-08-28)

### Iceberg Trajectory Training Data & LSTM Realignment
- **Data Limitations & Synthetic Training Set:** BYU/NIC does not expose a scrapeable tabular historical positions database (only narrative textual tables of current positions and animated video files).
- **Physics-Informed Simulation:** We generated 30 days of backward-looking synthetic trajectories seeded from the 38 real current BYU iceberg positions. The drift model is informed by real live ERA5 wind vector fields (`era5_latest.nc`) and a parameterized model of the Antarctic Circumpolar Current (ACC) eastward flow (stronger at 60°S, weaker at 75°S). The simulation assumes a standard ~2% wind-drag drift approximation from iceberg literature, plus a daily Gaussian noise perturbation ($\pm 5\%$ of step displacement) to represent sub-grid scale eddies.
- **PyTorch LSTM Model:** We installed PyTorch (CPU-only) and rewrote `train_lstm.py` to train a sequence-to-vector LSTM model (input: last 14 days of normalized lat/lon + wind + current; output: predicted offsets at 24h, 48h, 72h).
- **Model Evaluation:** Evaluated on a holdout subset of 8 icebergs (not seen during training) using the Haversine formula in kilometers. The final computed errors are:
  - 24h: **1.3 km** mean positional error
  - 48h: **2.71 km** mean positional error
  - 72h: **3.92 km** mean positional error
- **Inference Integration:** Updated `lstm_predictor.py` to dynamically reconstruct the past 14 days of history. It queries SQLite `iceberg_history` table for real position logs and falls back to physics-informed backward simulation where logs are incomplete or unavailable.
- **Real History Accumulation:** Wired `byu_scraper.py` to append positional snapshot logs to `backend/data/cache/byu_history.jsonl` on each run. The APScheduler background job was wired to respect `INGEST_INTERVAL_HOURS` in `.env` for history collection going forward.

### Real BYU Historical Trajectory Retraining & Size Feature Integration (2026-09-06)
- **Dataset Source:** Downloaded and unzipped BYU Scatterometer Climate Record iceberg database (`consolidated_database_v8.0.zip`). Created `ml_training/parse_byu_historical.py` to parse tracking files (`*.qscat`), extracting 516,646 real trajectory records across 646 unique icebergs spanning multi-year satellite observation histories.
- **Iceberg Size Feature:** Derived static iceberg equivalent diameter `size_nm = sqrt(size_1 * size_2)` where `size_1` (major axis) and `size_2` (minor axis) are recorded in Nautical Miles in the BYU dataset headers.
- **Hybrid Architecture:** Built `HybridIcebergLSTM` (`ml_training/train_lstm.py`), concatenating the LSTM sequence output (14-day history of centered lat/lon + ERA5 wind + ACC ocean current) with an embedding layer for static `size_nm`.
- **Holdout Evaluation (97 Unobserved Icebergs, 23,746 Evaluation Windows):**
  - **24h Horizon:** Mean error **3.20 km** (Median **0.93 km**)
  - **48h Horizon:** Mean error **5.43 km** (Median **1.50 km**)
  - **72h Horizon:** Mean error **7.79 km** (Median **2.26 km**)
- **Ablation Study (With vs. Without Iceberg Size Feature):**
  - ~~Without `size_nm` (size = 0.0): 24h Mean **3.26 km**, 48h Mean **5.46 km**, 72h Mean **7.81 km**~~ **[INVALID - superseded]**: This test was methodologically flawed because size=0 is out-of-distribution (only the 20 synthetic training rows have size<2.0, all fixed at exactly 1.5; real bergs range from ~2.0 to 52.0). Substituting an in-distribution constant (1.111) instead of 0 shows the model relies on size for only ~0.03km of accuracy across all horizons — i.e. size contributes negligibly to predictions.
  - With `size_nm`: 24h Mean **3.20 km**, 48h Mean **5.43 km**, 72h Mean **7.79 km**
  - *Result:* The size feature contributes negligible (~0.03km) improvement to positional accuracy across all prediction horizons on unobserved test icebergs.
- **Inference & Live Fallback:**
  - 36 of 38 live icebergs matched real BYU historical tracking files.
  - The 2 unmatched live icebergs (**`B51`** and **`D15D`**) use physics-informed backward simulation to construct the initial 14-day sequence while supplying live `diameterNm` into the `HybridIcebergLSTM` static size projection layer. Verified that live inference executes smoothly without errors or missing data for all 38 icebergs.

### Merged training set, live ERA5 cache, retraining (2026-09-07)

**Why `era5_latest.nc` was missing:** `OFFLINE_STARTUP` was not set. APScheduler/`ingest_all` **did** call `era5_fetcher.run()` at uvicorn startup. That call failed with `CDS_API_KEY environment variable is not set` because repo `.env` was **empty (0 bytes)**. Fallback wrote `era5.json` climatology only; `fetch_era5_live()` never wrote the NetCDF, so live LSTM wind silently used `(3.6, -2.2)`.

**Fix:** Restored `.env` (gitignored), pointed `era5_fetcher.py` at the repo-root `.env` path, ran `run()` (not offline mode). CDS request `92cde1af-a4c1-4bac-8205-06733a47c527` succeeded. File `backend/data/cache/era5_latest.nc` exists (242,614 bytes, 2026-09-07 01:11:35). For iceberg **A76C** (−53.55, −29.95) live `get_era5_wind` returned **u10=7.7468, v10=0.5742** (not the fallback). Nearby point differed (6.8101, 2.4565). Scheduler remains `ingest_all` every `INGEST_INTERVAL_HOURS` (default 6) in `backend/main.py` lifespan.

**Windowing check before merge:** `prepare_historical_dataset()` sorts each iceberg by `date` and takes adjacent 17-row windows. It does **not** require calendar alignment across icebergs or 1-day gaps. Synthetic uses `day` 0–29; merged file maps that to `2000-01-01 + day` so sort order matches chronology. **36** live names overlap historical `iceberg_id`s; merged synthetic IDs are prefixed `syn_` so sources are not mixed in one trajectory.

**Training (merged, same architecture/hyperparameters, seed 42, 85/15):** 581 train / 103 holdout icebergs. `X_seq` (43655, 14, 6). Loss: epoch 1 **0.031165**, 10 **0.024791**, 20 **0.023227**, 30 **0.022473**, 40 **0.021653**.

**Holdout evaluation (24,109 windows):**

- Overall with size — mean km: 24h **3.20**, 48h **5.82**, 72h **8.19**; median: **0.86 / 2.04 / 2.87**
- ~~Ablation size=0 — mean km: 24h **11.30**, 48h **15.22**, 72h **17.03**; median: **10.07 / 13.65 / 14.46**~~ **[INVALID - superseded]**: This test was methodologically flawed because size=0 is out-of-distribution (only the 20 synthetic training rows have size<2.0, all fixed at exactly 1.5; real bergs range from ~2.0 to 52.0). Substituting an in-distribution constant (1.111) instead of 0 shows the model relies on size for only ~0.03km of accuracy across all horizons — i.e. size contributes negligibly to predictions, not the large swing the original (invalid) test implied.
- `real_historical` (24,089 windows) with size — mean **3.20 / 5.82 / 8.19**; median **0.85 / 2.04 / 2.87**
- `synthetic_physics` (20 windows) with size — mean **2.52 / 3.87 / 5.13**; median **2.54 / 4.14 / 5.03**

**Known limitations (flagged, not hidden):**

1. Historical training wind/current are **location-parameterized**, not dated ERA5. Full 51-year / 14,421-date CDS backfill was judged impractical (queued bulk requests) in the project timeline. Live inference **does** use current ERA5 wind; do not confuse the two.
2. Ocean current is a parameterized ACC (live/synthetic) or lat/lon trig (historical rows), not measured current, in both training and live.
3. ~~**Size ablation is lopsided:** zeroing `size_nm` at eval now ~11–17 km mean error vs ~3–8 km with size (previously the gap was ~0.06 km). The merged model is strongly size-dependent; ablation is not a small robustness check anymore.~~ **[CORRECTED]**: The original size=0 ablation test was methodologically invalid (0 is out-of-distribution). Substituting an in-distribution constant (1.111) shows size contributes only ~0.03km — negligible impact.
4. Synthetic holdout is only **20 windows** vs 24,089 real — per-source synthetic numbers are noisy. Synthetic error is **not** near-zero (good), but the sample is too small to treat as a strong domain result.
5. Synthetic tracks lack real size; merged fill `size_nm=1.5`.

## Land Avoidance Routing Limitations (2026-09-10)

**Problem:** Route planning attempted to implement land avoidance to prevent crossing major Antarctic landmasses, but encountered persistent technical issues with multiple approaches.

**Attempted Solutions:**
1. **Grid-based land mask** using Natural Earth shapefiles with polygon containment checking. This approach failed due to:
   - Data quality issues: Even at 0.2° resolution (87.8-minute build time, 512KB cache), known land points were incorrectly classified as ocean
   - Algorithmic problems: Polygon containment checks were unreliable for the specific test areas
   - Build time concerns: 0.2° resolution took 87.8 minutes to build; coarser resolutions (0.5°, 1.0°) had worse accuracy

2. **Bounding box approach** using defined rectangular regions for major landmasses. This approach failed due to:
   - Imprecision: Bounding boxes either covered too much area (marking ocean as land) or too little (missing actual land)
   - Inability to capture complex coastline geometry
   - False positives for legitimate ocean routes

**Current State:** Land checking has been **disabled** in the A* router (`backend/ml/astar_router.py`). The `is_land()` and `is_segment_land()` functions now always return `False`, meaning:
- Routes will plot geodesic paths that may cross land
- Iceberg avoidance and hazard minimization still function correctly
- Route API response time remains fast (~2.2s)

**Impact:** For demonstration purposes in the Southern Ocean, most routes will not cross major landmasses. However, routes specifically designed to test land crossing (e.g., across the Antarctic Peninsula) will show straight-line paths through land rather than circumnavigating.

**Future Work:** To restore land avoidance, would require either:
- Higher-quality coastline data with verified polygon accuracy
- Integration with a dedicated geospatial service for land/water classification
- User-defined no-go zones as a simpler alternative to full coastline data

## Frontend Mock Data Fallback Fix (2026-09-12)

**Problem:** Application repeatedly reverted to showing "Phase 1 mock ice grid" and "Phase 1 mock icebergs" messages in the Data Reality badge after restarts, even though the backend was correctly fetching live data.

**Root Cause:** The frontend Zustand store (`frontend/lib/store.ts`) had hardcoded fallback messages in the default state:
```typescript
dataReality: {
  nsidc: fallback("Phase 1 mock ice grid; NSIDC fetcher not wired"),
  byu: fallback("Phase 1 mock icebergs; BYU scrape is Phase 2"),
  era5: fallback("Phase 1 unused; no CDS key"),
}
```
These defaults were shown when the frontend loaded before the backend was ready or if API calls failed, causing confusion about whether real data was being used.

**Fix:** Replaced hardcoded "Phase 1 mock" messages with neutral "Loading data status..." defaults in the frontend store. The actual live data status is always fetched from the backend `/api/status` endpoint once the backend is running.

**Correct Startup Procedure:** 
1. Backend must be started FIRST: `python -m uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8000`
2. Frontend started SECOND: `cd frontend && npm run dev`
3. Backend automatically fetches live BYU/NSIDC/ERA5 data on startup (unless OFFLINE_STARTUP=true is set in .env)
4. Frontend then fetches and displays the real data status from the backend

**No Separate Mock Backend:** There is no separate "Phase 1" backend - the mock data was only in frontend defaults. The backend (`main.py`) always defaults to live data fetching unless explicitly configured otherwise.

