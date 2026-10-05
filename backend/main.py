import asyncio
import os
import sys
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from data.byu_scraper import run as scrape_byu
from data.era5_fetcher import run as fetch_era5
from data.nsidc_fetcher import run as fetch_nsidc
from db.models import iceberg_count, init_db, upsert_icebergs
from db.redis_cache import get_json, set_json
from routers import alerts, health, ice, icebergs, routing, telemetry, sea_ice_grid, wildlife, ocean

import os
from dotenv import load_dotenv, find_dotenv
load_dotenv(find_dotenv(), override=True)

scheduler = AsyncIOScheduler()


async def ingest_all() -> None:
    init_db()
    if os.getenv("OFFLINE_STARTUP", "").lower() == "true":
        import json
        from pathlib import Path
        
        # Load BYU Cache
        byu_cache = Path(__file__).parent / "data" / "cache" / "byu_icebergs.json"
        if byu_cache.exists():
            byu = json.loads(byu_cache.read_text(encoding="utf-8"))
        else:
            byu = {"status": "FALLBACK", "icebergs": []}
            
        # Load NSIDC Cache
        nsidc_cache = Path(__file__).parent / "data" / "cache" / "nsidc_sic.json"
        if nsidc_cache.exists():
            nsidc = json.loads(nsidc_cache.read_text(encoding="utf-8"))
        else:
            nsidc = {"status": "FALLBACK"}
            
        # Load ERA5 Cache
        era5_cache = Path(__file__).parent / "data" / "cache" / "era5.json"
        if era5_cache.exists():
            era5 = json.loads(era5_cache.read_text(encoding="utf-8"))
        else:
            era5 = {"status": "FALLBACK"}
            
        upsert_icebergs(byu.get("icebergs", []), live=byu.get("live", False))
        set_json(
            "data_reality",
            {
                "byu": {
                    "status": "FALLBACK",
                    "count": len(byu.get("icebergs", [])),
                    "error": "Fallback: OFFLINE_STARTUP mode, live fetch skipped",
                },
                "nsidc": {
                    "status": "FALLBACK",
                    "fetched_at": nsidc.get("fetched_at"),
                    "error": "Fallback: OFFLINE_STARTUP mode, live fetch skipped",
                },
                "era5": {
                    "status": "FALLBACK",
                    "fetched_at": era5.get("fetched_at"),
                    "error": "Fallback: OFFLINE_STARTUP mode, live fetch skipped",
                },
            },
        )
        return

    loop = asyncio.get_running_loop()

    def update_reality(key: str, data: dict):
        reality = get_json("data_reality") or {
            "byu": {"status": "FALLBACK", "count": 0, "error": None},
            "nsidc": {"status": "FALLBACK", "live": False, "error": None},
            "era5": {"status": "FALLBACK", "live": False, "error": None},
        }
        reality[key] = data
        print(f"[INGEST] Updating reality for {key}: {data}")
        set_json("data_reality", reality)

    async def run_byu():
        print("[INGEST] Starting BYU scraper...")
        try:
            byu = await loop.run_in_executor(None, scrape_byu)
            print(f"[INGEST] BYU scraper completed with status {byu['status']}")
            # Upsert into database
            await loop.run_in_executor(None, upsert_icebergs, byu["icebergs"], byu["status"] == "LIVE")
            update_reality(
                "byu",
                {"status": byu["status"], "count": byu["count"], "error": byu.get("error")}
            )
        except Exception as e:
            print(f"[INGEST] BYU scraper failed: {e}")
            update_reality(
                "byu",
                {"status": "FALLBACK", "count": 0, "error": f"Scraper execution error: {e}"}
            )

    async def run_nsidc():
        print("[INGEST] Starting NSIDC fetcher...")
        try:
            nsidc = await loop.run_in_executor(None, fetch_nsidc)
            print(f"[INGEST] NSIDC fetcher completed with status {nsidc.get('status')}")
            update_reality("nsidc", nsidc)
            # Invalidate fuel model grid caches so fresh NSIDC data is picked up
            try:
                from ml.fuel_model import invalidate_grids
                invalidate_grids()
                # Also invalidate sea_ice_grid endpoint cache
                from routers.sea_ice_grid import _GRID_CACHE
                _GRID_CACHE.clear()
            except Exception:
                pass
        except Exception as e:
            print(f"[INGEST] NSIDC fetcher failed: {e}")
            update_reality(
                "nsidc",
                {"status": "FALLBACK", "error": f"Fetcher execution error: {e}"}
            )

    async def run_era5():
        print("[INGEST] Starting ERA5 fetcher...")
        try:
            era5 = await loop.run_in_executor(None, fetch_era5)
            print(f"[INGEST] ERA5 fetcher completed with status {era5.get('status')}")
            update_reality("era5", era5)
        except Exception as e:
            print(f"[INGEST] ERA5 fetcher failed: {e}")
            update_reality(
                "era5",
                {"status": "FALLBACK", "error": f"Fetcher execution error: {e}"}
            )

    await run_byu()
    await run_nsidc()
    await run_era5()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if sys.platform == "win32":
        loop = asyncio.get_running_loop()
        def _win_exception_handler(current_loop, context):
            exception = context.get("exception")
            if isinstance(exception, OSError) and getattr(exception, "winerror", None) in (64, 10054, 121, 22):
                return
            current_loop.default_exception_handler(context)
        loop.set_exception_handler(_win_exception_handler)

    init_db()
    # Trigger ingestion in the background so startup isn't blocked
    asyncio.create_task(ingest_all())
    
    interval_hours = int(os.getenv("INGEST_INTERVAL_HOURS", 6))
    scheduler.add_job(ingest_all, "interval", hours=interval_hours, id="ingest")
    scheduler.start()
    yield
    scheduler.shutdown(wait=False)


app = FastAPI(title="POLARIS API", version="0.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(alerts.router, tags=["alerts"])
app.include_router(health.router)
app.include_router(ice.router, prefix="/api/ice", tags=["ice"])
app.include_router(icebergs.router, prefix="/api/icebergs", tags=["icebergs"])
app.include_router(routing.router, prefix="/api/route", tags=["routing"])
app.include_router(sea_ice_grid.router, prefix="/api/sea-ice", tags=["sea-ice"])
app.include_router(telemetry.router, tags=["telemetry"])
app.include_router(wildlife.router, prefix="/api/wildlife", tags=["wildlife"])
app.include_router(ocean.router, prefix="/api/ocean", tags=["ocean"])


@app.get("/")
def root():
    return {"service": "POLARIS", "status": "ok", "icebergs": iceberg_count()}
