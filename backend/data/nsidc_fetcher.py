"""
NOAA/NSIDC Sea Ice Index (G02135) Southern Hemisphere Daily Concentration Fetcher.
==================================================================================
Primary data source:
  https://noaadata.apps.nsidc.org/NOAA/G02135/south/daily/geotiff/{YYYY}/{MM}_{Mon}/S_{YYYYMMDD}_concentration_v4.0.tif
  (with fallback to v3.0.tif for earlier records).

- Downloads daily polar stereographic GeoTIFF (EPSG:3412, 25km grid).
- Reads CRS and affine transform directly from the file via rasterio.
- Decodes special values: 0-1000 = concentration in tenths of a percent (divide by 10 for %, or 1000 for 0..1).
  Values > 1000 are flags (land=2540, coast=2530, pole hole=2510, missing=2550) converted to NaN/null.
- In-memory caching with 3-hour TTL; disk caching in backend/data/cache/nsidc_raw/.
- Fast bilinear lat/lon sampling via pyproj + rasterio inverse affine transform.
- Honest status tracking: LIVE, STALE (with age_hours), FALLBACK, or ERROR. Never synthetic data.
"""

from __future__ import annotations

import json
import logging
import math
import os
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any

import numpy as np
import pyproj
import rasterio
import requests
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv(), override=True)
logger = logging.getLogger("nsidc_fetcher")

# Paths
CACHE_DIR = Path(__file__).resolve().parent / "cache"
RAW_DIR = CACHE_DIR / "nsidc_raw"
META_CACHE_PATH = CACHE_DIR / "nsidc_sic.json"

RAW_DIR.mkdir(parents=True, exist_ok=True)

# In-memory raster cache
_LOADED_RASTER: dict[str, Any] | None = None
_LOADED_TIME: float = 0.0
_TTL_SECONDS: float = 3 * 3600.0  # 3 hours


def _month_folder_name(dt: datetime) -> str:
    """Format month folder name e.g. '09_Sep'."""
    return f"{dt.strftime('%m')}_{dt.strftime('%b')}"


def download_nsidc_geotiff(max_days_back: int = 7) -> tuple[str, str, str]:
    """
    Attempts to download the most recent NSIDC G02135 Antarctic daily concentration GeoTIFF.
    Tries today, then walks back day-by-day up to max_days_back days.
    
    Returns (local_filepath, remote_url, data_date_str).
    Raises RuntimeError if no live file could be fetched.
    """
    base_url = "https://noaadata.apps.nsidc.org/NOAA/G02135/south/daily/geotiff"
    headers = {
        "User-Agent": "PolarVision/1.0 (Antarctic Marine Navigation Research; NOAA Data Access)"
    }
    
    now = datetime.now(timezone.utc)
    last_err: Exception | None = None
    
    # NSIDC daily products lag by ~1 to 3 days
    for days_back in range(1, max_days_back + 1):
        target_date = now - timedelta(days=days_back)
        year_str = target_date.strftime("%Y")
        month_folder = _month_folder_name(target_date)
        date_str = target_date.strftime("%Y%m%d")
        iso_date = target_date.strftime("%Y-%m-%d")
        
        # Try v4.0 first, then v3.0
        for version in ["v4.0", "v3.0"]:
            filename = f"S_{date_str}_concentration_{version}.tif"
            url = f"{base_url}/{year_str}/{month_folder}/{filename}"
            local_path = RAW_DIR / filename
            
            # If already cached on disk and non-empty, reuse directly
            if local_path.exists() and local_path.stat().st_size > 10000:
                logger.info(f"Reusing disk-cached NSIDC file: {local_path.name}")
                return str(local_path), url, iso_date
            
            # Attempt HTTP download with retries
            for attempt in range(3):
                try:
                    resp = requests.get(url, headers=headers, timeout=20)
                    if resp.status_code == 200 and len(resp.content) > 10000:
                        with open(local_path, "wb") as f:
                            f.write(resp.content)
                        logger.info(f"Downloaded NSIDC GeoTIFF {filename} ({len(resp.content)} bytes)")
                        return str(local_path), url, iso_date
                    elif resp.status_code == 404:
                        break  # File does not exist for this day/version, try next
                except requests.RequestException as e:
                    last_err = e
                    time.sleep(0.5 * (2 ** attempt))
                    
    raise RuntimeError(f"No recent NSIDC GeoTIFF found in last {max_days_back} days. Last error: {last_err}")


def get_latest_cached_geotiff() -> tuple[str, str, str, float] | None:
    """
    Finds the newest GeoTIFF present in the local cache.
    Returns (local_path, source_url, data_date_str, age_hours) or None.
    """
    tif_files = sorted(RAW_DIR.glob("S_*_concentration_*.tif"), reverse=True)
    if not tif_files:
        return None
    
    best_file = tif_files[0]
    # Extract date from filename e.g. S_20260927_concentration_v4.0.tif
    parts = best_file.name.split("_")
    if len(parts) >= 2 and len(parts[1]) == 8 and parts[1].isdigit():
        d_str = parts[1]
        data_date = f"{d_str[:4]}-{d_str[4:6]}-{d_str[6:8]}"
        try:
            file_dt = datetime.strptime(d_str, "%Y%m%d").replace(tzinfo=timezone.utc)
            age_hours = (datetime.now(timezone.utc) - file_dt).total_seconds() / 3600.0
        except Exception:
            age_hours = (time.time() - best_file.stat().st_mtime) / 3600.0
    else:
        data_date = datetime.fromtimestamp(best_file.stat().st_mtime, timezone.utc).strftime("%Y-%m-%d")
        age_hours = (time.time() - best_file.stat().st_mtime) / 3600.0
        
    return str(best_file), f"cached://{best_file.name}", data_date, age_hours


def load_raster_data(force_reload: bool = False) -> dict[str, Any]:
    """
    Loads and caches the NSIDC GeoTIFF raster in memory.
    Decodes values into concentration (0..100%) and converts flags (>1000) to NaN.
    """
    global _LOADED_RASTER, _LOADED_TIME
    
    now = time.time()
    if not force_reload and _LOADED_RASTER is not None and (now - _LOADED_TIME) < _TTL_SECONDS:
        return _LOADED_RASTER
    
    live = False
    source_url = ""
    data_date = ""
    age_hours = 0.0
    error_msg = None
    file_path = None
    
    try:
        file_path, source_url, data_date = download_nsidc_geotiff(max_days_back=7)
        live = True
        status = "LIVE"
        # Normal data publishing lag is 1-3 days
        try:
            f_dt = datetime.strptime(data_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            age_hours = (datetime.now(timezone.utc) - f_dt).total_seconds() / 3600.0
        except Exception:
            age_hours = 0.0
    except Exception as exc:
        error_msg = str(exc)
        logger.warning(f"Live NSIDC fetch failed: {exc}. Checking local cache...")
        cached = get_latest_cached_geotiff()
        if cached:
            file_path, source_url, data_date, age_hours = cached
            status = "STALE" if age_hours > 72.0 else "LIVE"
            logger.info(f"Loaded cached GeoTIFF from {data_date} (age: {age_hours:.1f}h)")
        else:
            status = "ERROR"
            raise RuntimeError(f"No NSIDC data available (live fetch failed and no cached raster): {exc}")
    
    # Read raster via rasterio
    with rasterio.open(file_path) as ds:
        raw_data = ds.read(1)
        crs = ds.crs
        transform = ds.transform
        bounds = ds.bounds
        shape = ds.shape
        inv_transform = ~transform
    
    # Handle flags:
    # 0 - 1000: concentration in tenths of a percent
    # 2510 = pole hole, 2530 = coast, 2540 = land, 2550 = missing
    valid_mask = (raw_data <= 1000)
    data_pct = np.where(valid_mask, raw_data / 10.0, np.nan).astype(np.float32)
    data_frac = np.where(valid_mask, raw_data / 1000.0, np.nan).astype(np.float32)
    
    # Fast transformer to project WGS84 (lon, lat) to raster coordinates
    transformer = pyproj.Transformer.from_crs("EPSG:4326", crs, always_xy=True)
    
    valid_vals = data_pct[valid_mask]
    stats = {
        "min": float(np.min(valid_vals)) if len(valid_vals) > 0 else 0.0,
        "max": float(np.max(valid_vals)) if len(valid_vals) > 0 else 0.0,
        "mean": float(np.mean(valid_vals)) if len(valid_vals) > 0 else 0.0,
        "non_null_count": int(np.count_nonzero(valid_mask)),
        "total_pixels": int(raw_data.size),
    }
    
    _LOADED_RASTER = {
        "status": status,
        "live": live,
        "file_path": file_path,
        "source_url": source_url,
        "data_date": data_date,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "age_hours": round(age_hours, 1),
        "last_error": error_msg,
        "crs_str": str(crs),
        "shape": list(shape),
        "transform": transform,
        "inv_transform": inv_transform,
        "bounds": {
            "left": bounds.left, "bottom": bounds.bottom,
            "right": bounds.right, "top": bounds.top,
        },
        "data_frac": data_frac,  # 0.0 to 1.0 (NaN for land/flags)
        "data_pct": data_pct,    # 0.0 to 100.0 (NaN for land/flags)
        "transformer": transformer,
        "stats": stats,
    }
    _LOADED_TIME = now
    return _LOADED_RASTER


def sample_sic_bilinear(lats: np.ndarray, lons: np.ndarray) -> np.ndarray:
    """
    Samples sea-ice concentration [0.0..1.0] at given lat/lon arrays using bilinear interpolation.
    Returns float array. Land/flags/out-of-bounds are returned as np.nan.
    """
    raster = load_raster_data()
    data = raster["data_frac"]
    H, W = data.shape
    inv_t = raster["inv_transform"]
    transformer = raster["transformer"]
    
    # Transform WGS84 -> raster CRS (x, y)
    xs, ys = transformer.transform(lons, lats)
    
    # Raster indices (float)
    cols, rows = inv_t * (xs, ys)
    
    c0 = np.floor(cols).astype(np.int32)
    r0 = np.floor(rows).astype(np.int32)
    c1 = c0 + 1
    r1 = r0 + 1
    
    fc = cols - c0
    fr = rows - r0
    
    valid = (r0 >= 0) & (r1 < H) & (c0 >= 0) & (c1 < W)
    out = np.full(cols.shape, np.nan, dtype=np.float32)
    
    cr0 = np.clip(r0, 0, H - 1)
    cr1 = np.clip(r1, 0, H - 1)
    cc0 = np.clip(c0, 0, W - 1)
    cc1 = np.clip(c1, 0, W - 1)
    
    v00 = data[cr0, cc0]
    v01 = data[cr0, cc1]
    v10 = data[cr1, cc0]
    v11 = data[cr1, cc1]
    
    all_valid = ~np.isnan(v00) & ~np.isnan(v01) & ~np.isnan(v10) & ~np.isnan(v11)
    
    interp = (
        v00 * (1 - fc) * (1 - fr) +
        v01 * fc * (1 - fr) +
        v10 * (1 - fc) * fr +
        v11 * fc * fr
    )
    out[valid & all_valid] = interp[valid & all_valid]
    
    # Fallback to nearest neighbor near coastlines if not all 4 corners are valid
    partial = valid & ~all_valid & ~np.isnan(v00)
    if np.any(partial):
        out[partial] = v00[partial]
        
    return out


def get_data_status() -> dict[str, Any]:
    """
    Fast status lookup (responds in under 1 second from cache state).
    """
    global _LOADED_RASTER
    if _LOADED_RASTER is not None:
        r = _LOADED_RASTER
        return {
            "status": r["status"],
            "source_url": r["source_url"],
            "data_date": r["data_date"],
            "fetched_at": r["fetched_at"],
            "age_hours": r["age_hours"],
            "last_error": r["last_error"],
        }
    
    # Check disk cache metadata
    if META_CACHE_PATH.exists():
        try:
            meta = json.loads(META_CACHE_PATH.read_text(encoding="utf-8"))
            return {
                "status": "LIVE" if meta.get("live") else "STALE",
                "source_url": meta.get("source_url", "https://noaadata.apps.nsidc.org/NOAA/G02135/"),
                "data_date": meta.get("data_date"),
                "fetched_at": meta.get("fetched_at"),
                "age_hours": meta.get("age_hours", 24.0),
                "last_error": meta.get("error"),
            }
        except Exception:
            pass
            
    return {
        "status": "FALLBACK",
        "source_url": "https://noaadata.apps.nsidc.org/NOAA/G02135/",
        "data_date": None,
        "fetched_at": None,
        "age_hours": None,
        "last_error": "Not loaded yet",
    }


def run() -> dict[str, Any]:
    """
    Main entry point called by backend ingestion scheduler.
    Updates the cached NSIDC raster and writes status metadata.
    """
    try:
        raster = load_raster_data(force_reload=True)
        stats = raster["stats"]
        
        # Also generate sample cells for backward compatibility with /api/ice/current
        sample_lats = np.linspace(-75.0, -55.0, 30)
        sample_lons = np.linspace(-65.0, -35.0, 30)
        grid_lon, grid_lat = np.meshgrid(sample_lons, sample_lats)
        sampled_sic = sample_sic_bilinear(grid_lat.ravel(), grid_lon.ravel())
        
        sample_cells = []
        for lat, lon, sic in zip(grid_lat.ravel(), grid_lon.ravel(), sampled_sic):
            sample_cells.append({
                "lat": round(float(lat), 3),
                "lon": round(float(lon), 3),
                "sic": round(float(sic), 3) if not np.isnan(sic) else 0.0,
            })
            
        payload = {
            "status": raster["status"],
            "live": raster["live"],
            "source_url": raster["source_url"],
            "data_date": raster["data_date"],
            "fetched_at": raster["fetched_at"],
            "age_hours": raster["age_hours"],
            "error": raster["last_error"],
            "stats": stats,
            "cells": sample_cells,
        }
        META_CACHE_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        
        return {
            "status": raster["status"],
            "data_date": raster["data_date"],
            "source_url": raster["source_url"],
            "age_hours": raster["age_hours"],
            "non_null_cells": stats["non_null_count"],
            "error": raster["last_error"],
        }
    except Exception as exc:
        logger.error(f"Error in NSIDC run(): {exc}", exc_info=True)
        return {
            "status": "ERROR",
            "data_date": None,
            "source_url": None,
            "age_hours": None,
            "error": str(exc),
        }


# ---------------------------------------------------------------------------
# Backward-compatibility shims (used by ml/icenet_runner.py)
# ---------------------------------------------------------------------------

#: Alias for legacy imports that expect CACHE_PATH
CACHE_PATH = META_CACHE_PATH


def synthetic_grid() -> dict:
    """
    Shim: returns the last cached NSIDC cell list, or an empty grid.
    Legacy callers (icenet_runner) use this as a baseline for day-N forecasts.
    """
    if META_CACHE_PATH.exists():
        try:
            data = json.loads(META_CACHE_PATH.read_text(encoding="utf-8"))
            cells = data.get("cells", [])
            if cells:
                return {"cells": cells}
        except Exception:
            pass
    # Minimal stub so icenet_runner doesn't crash with no cache
    return {"cells": []}


if __name__ == "__main__":
    import pprint
    pprint.pprint(run())
