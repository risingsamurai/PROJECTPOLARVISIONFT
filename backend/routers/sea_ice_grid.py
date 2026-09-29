"""
Sea Ice Concentration Grid and Image API Router.
================================================
Serves reprojected regular lat/lon SIC fields for heatmap rendering:
  - GET /api/sea-ice/grid : JSON with bounds, dimensions, row-major % values, and stats.
  - GET /api/sea-ice/image : RGBA PNG overlay georeferenced to the requested bounds.
"""
from __future__ import annotations

import io
import json
import logging
import math
import time
from typing import Any

from fastapi import APIRouter, Query, HTTPException, Response
from fastapi.responses import StreamingResponse
import numpy as np
from PIL import Image

try:
    from data.nsidc_fetcher import load_raster_data, sample_sic_bilinear
except ImportError:
    from backend.data.nsidc_fetcher import load_raster_data, sample_sic_bilinear

try:
    from data.land_mask import is_land
except ImportError:
    try:
        from backend.data.land_mask import is_land
    except ImportError:
        is_land = None

logger = logging.getLogger("sea_ice_grid")
router = APIRouter()

# Memory cache for computed grids with 3h TTL
_GRID_CACHE: dict[str, dict[str, Any]] = {}
_GRID_CACHE_TIME: dict[str, float] = {}
_PNG_CACHE: dict[str, bytes] = {}
_CACHE_TTL = 3 * 3600.0  # 3 hours


def _sic_to_rgba(sic_pct: float) -> tuple[int, int, int, int]:
    """
    Maps SIC percentage (0.0 to 100.0) to RGBA matching the specified legend:
      0-15%:   transparent / deep blue (0% = transparent, 15% = pale cyan)
      15-30%:  pale cyan (ice edge)
      30-60%:  light blue to whitish
      60-80%:  near-white
      80-100%: solid opaque white/light grey
    """
    if math.isnan(sic_pct) or sic_pct < 0.0:
        return (0, 0, 0, 0)
    
    s = max(0.0, min(100.0, sic_pct))
    
    if s < 15.0:
        # 0% transparent to 15% pale cyan
        t = s / 15.0
        r = int(10 + (100 - 10) * t)
        g = int(40 + (200 - 40) * t)
        b = int(100 + (230 - 100) * t)
        a = int(t * 110)  # low alpha near 0, rising to ~110 at 15%
        return (r, g, b, a)
    elif s < 30.0:
        # 15% to 30%: cyan ice edge
        t = (s - 15.0) / 15.0
        r = int(100 + (140 - 100) * t)
        g = int(200 + (210 - 200) * t)
        b = int(230 + (240 - 230) * t)
        a = int(110 + (160 - 110) * t)
        return (r, g, b, a)
    elif s < 60.0:
        # 30% to 60%: light blue to whitish
        t = (s - 30.0) / 30.0
        r = int(140 + (215 - 140) * t)
        g = int(210 + (238 - 210) * t)
        b = int(240 + (250 - 240) * t)
        a = int(160 + (210 - 160) * t)
        return (r, g, b, a)
    elif s < 80.0:
        # 60% to 80%: near-white
        t = (s - 60.0) / 20.0
        r = int(215 + (240 - 215) * t)
        g = int(238 + (248 - 238) * t)
        b = int(250 + (255 - 250) * t)
        a = int(210 + (235 - 210) * t)
        return (r, g, b, a)
    else:
        # 80% to 100%: opaque white / light grey
        t = (s - 80.0) / 20.0
        r = int(240 + (255 - 240) * t)
        g = int(248 + (255 - 248) * t)
        b = int(255 + (255 - 255) * t)
        a = int(235 + (250 - 235) * t)
        return (r, g, b, a)


def _compute_reprojected_grid(
    min_lat: float,
    max_lat: float,
    min_lon: float,
    max_lon: float,
    res: float,
) -> dict[str, Any]:
    """Computes a regular lat/lon grid sampled bilinearly from the NSIDC polar GeoTIFF."""
    cache_key = f"{min_lat}:{max_lat}:{min_lon}:{max_lon}:{res}"
    now = time.time()
    
    if cache_key in _GRID_CACHE and (now - _GRID_CACHE_TIME.get(cache_key, 0.0)) < _CACHE_TTL:
        return _GRID_CACHE[cache_key]
        
    try:
        raster = load_raster_data()
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"sea_ice_data_unavailable: {exc}"
        )
        
    # Generate regular lat/lon coordinates
    # Rows: north to south (max_lat down to min_lat) for standard top-down image alignment
    lats = np.arange(max_lat, min_lat - 1e-5, -res, dtype=np.float32)
    lons = np.arange(min_lon, max_lon + 1e-5, res, dtype=np.float32)
    
    H = len(lats)
    W = len(lons)
    
    lon_grid, lat_grid = np.meshgrid(lons, lats)
    flat_lats = lat_grid.ravel()
    flat_lons = lon_grid.ravel()
    
    # Bilinear sample from polar stereographic raster (values 0.0 to 1.0 or NaN)
    sampled_frac = sample_sic_bilinear(flat_lats, flat_lons)
    
    # Convert to percent 0.0 - 100.0
    flat_pct = sampled_frac * 100.0
    
    # Apply land mask: if point is on land, mask as NaN
    if is_land is not None:
        # Check coordinates in parallel/vectorized manner
        for i in range(len(flat_lats)):
            if not np.isnan(flat_pct[i]):
                if is_land(float(flat_lats[i]), float(flat_lons[i])):
                    flat_pct[i] = np.nan
                    
    # Reshape
    grid_2d = flat_pct.reshape((H, W))
    
    # Non-null mask
    valid_mask = ~np.isnan(grid_2d)
    non_null_count = int(np.count_nonzero(valid_mask))
    
    logger.info(
        f"[SEA_ICE_GRID] Bounds [{min_lat}, {max_lat}] x [{min_lon}, {max_lon}] @ res {res}° "
        f"-> {H}x{W} cells, non-null: {non_null_count}"
    )
    
    if non_null_count == 0:
        raise HTTPException(
            status_code=503,
            detail="sea_ice_data_unavailable: 0 non-null cells in requested bounding box"
        )
        
    valid_vals = grid_2d[valid_mask]
    stats = {
        "min": round(float(np.min(valid_vals)), 1) if len(valid_vals) > 0 else 0.0,
        "max": round(float(np.max(valid_vals)), 1) if len(valid_vals) > 0 else 0.0,
        "mean": round(float(np.mean(valid_vals)), 1) if len(valid_vals) > 0 else 0.0,
        "non_null_count": non_null_count,
        "total_cells": H * W,
    }
    
    # Build list of cells for point-based and tooltip consumers
    # (rounded values, null for land/missing)
    cells = []
    # Build compact row-major values array
    values = []
    for r in range(H):
        for c in range(W):
            v = grid_2d[r, c]
            if np.isnan(v):
                val = None
            else:
                val = round(float(v), 1)
            values.append(val)
            cells.append({
                "lat": round(float(lats[r]), 4),
                "lon": round(float(lons[c]), 4),
                "sic": val / 100.0 if val is not None else None,  # fraction 0..1 for standard map layers
                "sic_pct": val,
            })
            
    result = {
        "date": raster["data_date"],
        "source": f"NOAA/NSIDC G02135 ({raster['status']})",
        "bounds": {
            "min_lat": min_lat, "max_lat": max_lat,
            "min_lon": min_lon, "max_lon": max_lon,
        },
        "width": W,
        "height": H,
        "resolution_deg": res,
        "stats": stats,
        "values": values,
        "cells": cells,
        "grid_2d": grid_2d,
    }
    
    _GRID_CACHE[cache_key] = result
    _GRID_CACHE_TIME[cache_key] = now
    return result


@router.get("/grid")
def sea_ice_grid(
    min_lat: float = Query(-80.0, ge=-85.0, le=0.0, description="Minimum latitude"),
    max_lat: float = Query(-50.0, ge=-85.0, le=0.0, description="Maximum latitude"),
    min_lon: float = Query(-180.0, ge=-180.0, le=180.0, description="Minimum longitude"),
    max_lon: float = Query(180.0, ge=-180.0, le=180.0, description="Maximum longitude"),
    res: float = Query(0.25, ge=0.1, le=2.0, description="Grid resolution in degrees"),
):
    """
    Returns reprojected sea ice concentration grid in JSON.
    Values are % (0.0 to 100.0) or null for land/no-data.
    """
    data = _compute_reprojected_grid(min_lat, max_lat, min_lon, max_lon, res)
    # Return serializable dict (exclude raw numpy grid_2d)
    return {
        "date": data["date"],
        "source": data["source"],
        "bounds": data["bounds"],
        "width": data["width"],
        "height": data["height"],
        "resolution_deg": data["resolution_deg"],
        "stats": data["stats"],
        "values": data["values"],
        "cells": data["cells"],
        "n_cells": len(data["cells"]),
    }


@router.get("/image")
@router.get("/png")
def sea_ice_image(
    min_lat: float = Query(-80.0, ge=-85.0, le=0.0),
    max_lat: float = Query(-50.0, ge=-85.0, le=0.0),
    min_lon: float = Query(-180.0, ge=-180.0, le=180.0),
    max_lon: float = Query(180.0, ge=-180.0, le=180.0),
    res: float = Query(0.25, ge=0.1, le=2.0),
    opacity: float = Query(1.0, ge=0.0, le=1.0),
):
    """
    Returns an RGBA PNG raster tile of sea ice concentration with smooth color ramp applied.
    Land and zero-concentration pixels are transparent.
    """
    cache_key = f"png:{min_lat}:{max_lat}:{min_lon}:{max_lon}:{res}:{opacity}"
    if cache_key in _PNG_CACHE:
        return Response(content=_PNG_CACHE[cache_key], media_type="image/png")
        
    grid_data = _compute_reprojected_grid(min_lat, max_lat, min_lon, max_lon, res)
    grid_2d = grid_data["grid_2d"]
    H, W = grid_2d.shape
    
    rgba = np.zeros((H, W, 4), dtype=np.uint8)
    for r in range(H):
        for c in range(W):
            v = grid_2d[r, c]
            if not np.isnan(v):
                red, green, blue, alpha = _sic_to_rgba(v)
                rgba[r, c] = [red, green, blue, int(alpha * opacity)]
                
    img = Image.fromarray(rgba, mode="RGBA")
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    png_bytes = buf.getvalue()
    
    _PNG_CACHE[cache_key] = png_bytes
    return Response(
        content=png_bytes,
        media_type="image/png",
        headers={
            "X-Data-Date": str(grid_data["date"]),
            "X-Source": str(grid_data["source"]),
            "Cache-Control": "public, max-age=10800",
        }
    )
