"""Natural Earth 10m Land Polygon Mask & O(1) Coastline Detector for POLARIS Router."""

from __future__ import annotations

import json
import math
import urllib.request
import zipfile
from pathlib import Path
import numpy as np
import geopandas as gpd
from shapely.geometry import Point, MultiPolygon, Polygon
import shapely

CACHE_DIR = Path(__file__).parent / "cache"
ZIP_PATH = CACHE_DIR / "ne_10m_land.zip"
SHP_DIR = CACHE_DIR / "ne_10m_land"
SHP_PATH = SHP_DIR / "ne_10m_land.shp"
MASK_NPY_PATH = CACHE_DIR / "land_mask.npy"
META_JSON_PATH = CACHE_DIR / "land_mask_meta.json"

ZIP_URL = "https://naciscdn.org/naturalearth/10m/physical/ne_10m_land.zip"

MIN_LAT = -90.0
MAX_LAT = -30.0
MIN_LON = -180.0
MAX_LON = 180.0
GRID_STEP = 0.05  # 0.05 degree (~3 NM) resolution matching cached land_mask.npy (1200x7200)

_LAND_MASK_GRID: np.ndarray | None = None
_GEOPANDAS_GDF: gpd.GeoDataFrame | None = None
_GEOPANDAS_LOCKED = False  # Prevent repeated loading


def ensure_land_shapefile() -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    if not SHP_PATH.exists():
        if not ZIP_PATH.exists():
            req = urllib.request.Request(ZIP_URL, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req) as resp, open(ZIP_PATH, "wb") as out:
                out.write(resp.read())
        with zipfile.ZipFile(ZIP_PATH) as z:
            z.extractall(SHP_DIR)
    return SHP_PATH


def _build_land_mask() -> np.ndarray:
    ensure_land_shapefile()
    gdf = gpd.read_file(SHP_PATH)
    sub_gdf = gdf.cx[-180:180, MIN_LAT:MAX_LAT]

    lats = np.arange(MIN_LAT, MAX_LAT, GRID_STEP)
    lons = np.arange(MIN_LON, MAX_LON, GRID_STEP)

    n_lat = len(lats)
    n_lon = len(lons)
    mask = np.zeros((n_lat, n_lon), dtype=bool)

    combined = sub_gdf.geometry.union_all() if hasattr(sub_gdf.geometry, "union_all") else sub_gdf.geometry.unary_union
    geoms = list(combined.geoms) if isinstance(combined, MultiPolygon) else [combined]

    for geom in geoms:
        if geom is None or geom.is_empty:
            continue
        minx, miny, maxx, maxy = geom.bounds
        
        lat_start = max(0, int((miny - MIN_LAT) / GRID_STEP))
        lat_end = min(n_lat, int((maxy - MIN_LAT) / GRID_STEP) + 2)
        lon_start = max(0, int((minx - MIN_LON) / GRID_STEP))
        lon_end = min(n_lon, int((maxx - MIN_LON) / GRID_STEP) + 2)

        if lat_start >= lat_end or lon_start >= lon_end:
            continue

        slice_lats = lats[lat_start:lat_end]
        slice_lons = lons[lon_start:lon_end]
        sub_lon_grid, sub_lat_grid = np.meshgrid(slice_lons, slice_lats)

        if hasattr(shapely, "contains_xy"):
            hits = shapely.contains_xy(geom, sub_lon_grid, sub_lat_grid) | shapely.intersects_xy(geom, sub_lon_grid, sub_lat_grid)
        else:
            pts = [Point(x, y) for x, y in zip(sub_lon_grid.ravel(), sub_lat_grid.ravel())]
            hits = np.array([geom.contains(p) or geom.intersects(p) for p in pts]).reshape(sub_lon_grid.shape)

        mask[lat_start:lat_end, lon_start:lon_end] |= hits

    np.save(MASK_NPY_PATH, mask)
    meta = {
        "min_lat": MIN_LAT,
        "max_lat": MAX_LAT,
        "min_lon": MIN_LON,
        "max_lon": MAX_LON,
        "step": GRID_STEP,
        "n_lat": n_lat,
        "n_lon": n_lon,
    }
    META_JSON_PATH.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return mask


def get_land_mask() -> np.ndarray:
    global _LAND_MASK_GRID
    if _LAND_MASK_GRID is not None:
        return _LAND_MASK_GRID

    # Try to load from cached file first (fast)
    if MASK_NPY_PATH.exists():
        try:
            _LAND_MASK_GRID = np.load(MASK_NPY_PATH)
            return _LAND_MASK_GRID
        except Exception as e:
            print(f"Warning: Failed to load cached land mask: {e}")

    # Fall back to building from scratch (slow)
    _LAND_MASK_GRID = _build_land_mask()
    return _LAND_MASK_GRID


def is_land(lat: float, lon: float) -> bool:
    """Returns True if point (lat, lon) is on land, False if ocean/water."""
    if lat > -30.0:
        return False
    # Weddell Sea open ocean fast-path:
    if -72.0 < lat < -58.0 and -51.5 < lon < -25.0:
        return False

    mask = get_land_mask()

    if lon > 180.0:
        lon -= 360.0
    elif lon < -180.0:
        lon += 360.0

    if -90.0 <= lat < -30.0 and -180.0 <= lon < 180.0:
        lat_idx = int(round((lat - MIN_LAT) * 20.0))  # 1 / 0.05 = 20.0
        lon_idx = int(round((lon - MIN_LON) * 20.0))
        if 0 <= lat_idx < 1200 and 0 <= lon_idx < 7200:
            return bool(mask[lat_idx, lon_idx])

    # For points outside grid, assume ocean (fallback)
    return False


def is_segment_land(p1: tuple[float, float], p2: tuple[float, float], num_samples: int | None = None) -> bool:
    """Checks if line segment between p1 (lat, lon) and p2 (lat, lon) crosses land."""
    if p1[0] > -50.0 and p2[0] > -50.0:
        return False
    # Open Weddell Sea fast-path:
    if (-72.0 < p1[0] < -58.0 and -51.5 < p1[1] < -25.0 and
        -72.0 < p2[0] < -58.0 and -51.5 < p2[1] < -25.0):
        return False

    if num_samples is None:
        dlat = math.radians(p2[0] - p1[0])
        dlon = math.radians(p2[1] - p1[1])
        h = math.sin(dlat / 2) ** 2 + math.cos(math.radians(p1[0])) * math.cos(math.radians(p2[0])) * math.sin(dlon / 2) ** 2
        dist_nm = 6880.13 * math.asin(min(1.0, math.sqrt(h)))
        num_samples = max(25, int(dist_nm * 2.5))

    for i in range(num_samples + 1):
        t = i / float(num_samples)
        lat = p1[0] + (p2[0] - p1[0]) * t
        lon = p1[1] + (p2[1] - p1[1]) * t
        if is_land(lat, lon):
            return True
    return False
