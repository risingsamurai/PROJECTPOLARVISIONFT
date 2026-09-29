"""Health and Data Status API Router."""
from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter

from db.redis_cache import get_json

router = APIRouter()

CACHE_DIR = Path(__file__).resolve().parent.parent / "data" / "cache"
BYU_CACHE = CACHE_DIR / "byu_icebergs.json"
ERA5_CACHE = CACHE_DIR / "era5.json"
NSIDC_META = CACHE_DIR / "nsidc_sic.json"


def _get_byu_status() -> dict:
    if BYU_CACHE.exists():
        try:
            data = json.loads(BYU_CACHE.read_text(encoding="utf-8"))
            mtime = BYU_CACHE.stat().st_mtime
            age_h = round((time.time() - mtime) / 3600.0, 1)
            fetched_at = datetime.fromtimestamp(mtime, timezone.utc).isoformat()
            count = len(data.get("icebergs", []))
            raw_status = data.get("status", "LIVE")
            # If fresh within 36 hours, mark LIVE
            status = "LIVE" if (raw_status == "LIVE" and age_h <= 36.0) else ("STALE" if count > 0 else "FALLBACK")
            return {
                "status": status,
                "source_url": "https://www.scp.byu.edu/data/iceberg/database1.html",
                "data_date": fetched_at[:10],
                "fetched_at": fetched_at,
                "age_hours": age_h,
                "count": count,
                "last_error": data.get("error"),
            }
        except Exception as e:
            return {
                "status": "ERROR",
                "source_url": "https://www.scp.byu.edu/data/iceberg/database1.html",
                "data_date": None,
                "fetched_at": None,
                "age_hours": None,
                "count": 0,
                "last_error": str(e),
            }
    return {
        "status": "FALLBACK",
        "source_url": "https://www.scp.byu.edu/data/iceberg/database1.html",
        "data_date": None,
        "fetched_at": None,
        "age_hours": None,
        "count": 0,
        "last_error": "No cache file found",
    }


def _get_era5_status() -> dict:
    if ERA5_CACHE.exists():
        try:
            data = json.loads(ERA5_CACHE.read_text(encoding="utf-8"))
            mtime = ERA5_CACHE.stat().st_mtime
            age_h = round((time.time() - mtime) / 3600.0, 1)
            fetched_at = data.get("fetched_at") or datetime.fromtimestamp(mtime, timezone.utc).isoformat()
            vectors = data.get("vectors", [])
            raw_status = data.get("status", "LIVE")
            status = "LIVE" if (raw_status == "LIVE" and age_h <= 36.0) else ("STALE" if len(vectors) > 0 else "FALLBACK")
            return {
                "status": status,
                "source_url": "https://cds.climate.copernicus.eu/api/v2",
                "data_date": fetched_at[:10],
                "fetched_at": fetched_at,
                "age_hours": age_h,
                "points": len(vectors),
                "last_error": data.get("error"),
            }
        except Exception as e:
            return {
                "status": "ERROR",
                "source_url": "https://cds.climate.copernicus.eu/api/v2",
                "data_date": None,
                "fetched_at": None,
                "age_hours": None,
                "points": 0,
                "last_error": str(e),
            }
    return {
        "status": "FALLBACK",
        "source_url": "https://cds.climate.copernicus.eu/api/v2",
        "data_date": None,
        "fetched_at": None,
        "age_hours": None,
        "points": 0,
        "last_error": "No cache file found",
    }


def _get_nsidc_status() -> dict:
    try:
        from data.nsidc_fetcher import get_data_status
        return get_data_status()
    except Exception as e:
        return {
            "status": "ERROR",
            "source_url": "https://noaadata.apps.nsidc.org/NOAA/G02135/",
            "data_date": None,
            "fetched_at": None,
            "age_hours": None,
            "last_error": str(e),
        }


@router.get("/health")
def health():
    return {"status": "ok", "service": "polaris-backend"}


@router.get("/api/data-status")
def data_status():
    """
    Returns data reality status for all feeds in <1 second from cache state.
    """
    return {
        "nsidc": _get_nsidc_status(),
        "byu_nic": _get_byu_status(),
        "era5": _get_era5_status(),
    }


@router.get("/api/status")
def api_status():
    """
    Backward-compatible alias for existing frontend callers.
    Provides byu, nsidc, era5 status blocks.
    """
    ds = data_status()
    # Align byu key to support both byu and byu_nic
    return {
        "nsidc": ds["nsidc"],
        "byu": ds["byu_nic"],
        "byu_nic": ds["byu_nic"],
        "era5": ds["era5"],
    }
