"""
POLARIS Physical Fuel Model
============================
Per-segment fuel calculation using:
  - Cubic-law speed dependence
  - Ice resistance from NSIDC SIC
  - Weather resistance from ERA5 wind/wave data

All constants come from config/vessel_params.py.
"""
from __future__ import annotations

import json
import math
from pathlib import Path
from functools import lru_cache

import numpy as np

try:
    from config.vessel_params import (
        DESIGN_SPEED_KTS, DESIGN_FUEL_HOUR,
        ICE_RESISTANCE_BREAKPOINTS, ICE_SPEED_REDUCTION_BREAKPOINTS,
        WAVE_RESISTANCE_COEFF, WIND_DRAG_COEFF,
        IMPASSABLE_ICE_SIC, PROFILE_SPEEDS, min_fuel_per_nm,
    )
except ImportError:
    from backend.config.vessel_params import (
        DESIGN_SPEED_KTS, DESIGN_FUEL_HOUR,
        ICE_RESISTANCE_BREAKPOINTS, ICE_SPEED_REDUCTION_BREAKPOINTS,
        WAVE_RESISTANCE_COEFF, WIND_DRAG_COEFF,
        IMPASSABLE_ICE_SIC, PROFILE_SPEEDS, min_fuel_per_nm,
    )

# ── Cache paths ───────────────────────────────────────────────────────────────
_DATA_DIR = Path(__file__).resolve().parent / "data" / "cache"
_NSIDC_CACHE = _DATA_DIR / "nsidc_sic.json"
_ERA5_CACHE  = _DATA_DIR / "era5.json"

# ── In-memory grid caches (loaded once) ──────────────────────────────────────
_sic_grid: dict | None = None   # {lats: np.array, lons: np.array, sic: np.array}
_era5_grid: dict | None = None  # {lats: np.array, lons: np.array, wind_u, wind_v}

_ICE_SICS = np.array([b[0] for b in ICE_RESISTANCE_BREAKPOINTS])
_ICE_RFAC = np.array([b[1] for b in ICE_RESISTANCE_BREAKPOINTS])
_ICE_SSICS = np.array([b[0] for b in ICE_SPEED_REDUCTION_BREAKPOINTS])
_ICE_SFAC  = np.array([b[1] for b in ICE_SPEED_REDUCTION_BREAKPOINTS])


# ─────────────────────────────────────────────────────────────────────────────
# Grid loaders
# ─────────────────────────────────────────────────────────────────────────────

def _load_sic_grid() -> dict:
    """Load NSIDC SIC grid from cache into a vectorized numpy structure."""
    global _sic_grid
    if _sic_grid is not None:
        return _sic_grid

    cells: list[dict] = []
    if _NSIDC_CACHE.exists():
        try:
            data = json.loads(_NSIDC_CACHE.read_text(encoding="utf-8"))
            cells = data.get("cells", [])
        except Exception:
            pass

    if not cells:
        # Synthetic fallback (same formula as nsidc_fetcher.synthetic_grid)
        for lat in [-62 + 0.4 * k for k in range(22)]:
            for lon in [-60 + 0.6 * k for k in range(28)]:
                ice = 0.15 + 0.55 / (1 + math.exp((lat + 66) / 1.8))
                ice += 0.08 * math.sin((lon + 50) / 8)
                cells.append({"lat": lat, "lon": lon, "sic": max(0.0, min(1.0, ice))})

    lats = np.array([c["lat"] for c in cells], dtype=np.float32)
    lons = np.array([c["lon"] for c in cells], dtype=np.float32)
    sics = np.array([c["sic"] for c in cells], dtype=np.float32)

    _sic_grid = {"lats": lats, "lons": lons, "sic": sics}
    return _sic_grid


def _load_era5_grid() -> dict:
    """Load ERA5 wind grid from cache into a vectorized numpy structure."""
    global _era5_grid
    if _era5_grid is not None:
        return _era5_grid

    vectors: list[dict] = []
    if _ERA5_CACHE.exists():
        try:
            data = json.loads(_ERA5_CACHE.read_text(encoding="utf-8"))
            vectors = data.get("vectors", [])
        except Exception:
            pass

    if not vectors:
        # Climatology fallback
        for lat in [-62 + 0.5 * k for k in range(18)]:
            for lon in [-58 + 0.7 * k for k in range(22)]:
                vectors.append({
                    "lat": lat, "lon": lon,
                    "wind_u": 4.2 * math.cos(math.radians(lon)),
                    "wind_v": -3.1 + 1.4 * math.sin(math.radians(lat * 3)),
                })

    lats = np.array([v["lat"] for v in vectors], dtype=np.float32)
    lons = np.array([v["lon"] for v in vectors], dtype=np.float32)
    wu   = np.array([v.get("wind_u", 0.0) for v in vectors], dtype=np.float32)
    wv   = np.array([v.get("wind_v", 0.0) for v in vectors], dtype=np.float32)

    _era5_grid = {"lats": lats, "lons": lons, "wind_u": wu, "wind_v": wv}
    return _era5_grid


def invalidate_grids() -> None:
    """Force reload of cached grids (call after NSIDC/ERA5 refresh)."""
    global _sic_grid, _era5_grid
    _sic_grid = None
    _era5_grid = None


# ─────────────────────────────────────────────────────────────────────────────
# Per-point lookups (vectorised bilinear GeoTIFF + fallback)
# ─────────────────────────────────────────────────────────────────────────────

def lookup_sic(lat: float, lon: float) -> float:
    """Return sea-ice concentration [0..1] at (lat, lon)."""
    if lat > -50.0:
        return 0.0
    try:
        from data.nsidc_fetcher import sample_sic_bilinear
        v = sample_sic_bilinear(np.array([lat], dtype=np.float32), np.array([lon], dtype=np.float32))[0]
        if not np.isnan(v):
            return float(max(0.0, min(1.0, v)))
    except Exception:
        pass

    g = _load_sic_grid()
    if len(g["lats"]) == 0:
        return 0.0
    dists = (g["lats"] - lat) ** 2 + (g["lons"] - lon) ** 2
    return float(g["sic"][np.argmin(dists)])


def lookup_wind(lat: float, lon: float) -> tuple[float, float]:
    """Return (wind_u, wind_v) in m/s at (lat, lon)."""
    g = _load_era5_grid()
    if len(g["lats"]) == 0:
        return 0.0, 0.0
    dists = (g["lats"] - lat) ** 2 + (g["lons"] - lon) ** 2
    idx = int(np.argmin(dists))
    return float(g["wind_u"][idx]), float(g["wind_v"][idx])


def lookup_sic_batch(lats: np.ndarray, lons: np.ndarray) -> np.ndarray:
    """Vectorised SIC lookup for arrays of coordinates."""
    n = len(lats)
    result = np.zeros(n, dtype=np.float32)
    antarctic_idx = np.where(lats <= -50.0)[0]
    if len(antarctic_idx) > 0:
        try:
            from data.nsidc_fetcher import sample_sic_bilinear
            sampled = sample_sic_bilinear(lats[antarctic_idx], lons[antarctic_idx])
            valid = ~np.isnan(sampled)
            result[antarctic_idx[valid]] = np.clip(sampled[valid], 0.0, 1.0)
            return result
        except Exception:
            pass

    g = _load_sic_grid()
    if len(g["lats"]) == 0:
        return result
    for i in range(n):
        if lats[i] <= -50.0:
            dists = (g["lats"] - lats[i]) ** 2 + (g["lons"] - lons[i]) ** 2
            result[i] = g["sic"][np.argmin(dists)]
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Ice & weather resistance helpers
# ─────────────────────────────────────────────────────────────────────────────

def ice_resistance_factor(sic: float) -> float:
    """Return the ice resistance multiplier (≥1.0) for a given SIC."""
    return float(np.interp(sic, _ICE_SICS, _ICE_RFAC))


def ice_speed_fraction(sic: float) -> float:
    """Return the maximum achievable speed fraction [0..1] in given SIC."""
    return float(np.interp(sic, _ICE_SSICS, _ICE_SFAC))


def wave_resistance_factor(hs_m: float) -> float:
    """Return added resistance factor from significant wave height Hs (metres)."""
    return max(0.0, WAVE_RESISTANCE_COEFF * hs_m)


def wind_drag_factor(wind_speed_ms: float) -> float:
    """Return added fuel rate fraction from wind speed (m/s)."""
    return WIND_DRAG_COEFF * wind_speed_ms ** 2


# ─────────────────────────────────────────────────────────────────────────────
# Core segment fuel calculation
# ─────────────────────────────────────────────────────────────────────────────

def segment_fuel(
    lat_mid: float,
    lon_mid: float,
    dist_nm: float,
    speed_kts: float,
    sic: float | None = None,
) -> tuple[float, float, float, float]:
    """
    Calculate fuel consumption (MT) for one route segment.

    Parameters
    ----------
    lat_mid, lon_mid : midpoint of the segment (for weather/ice lookup)
    dist_nm          : segment length in nautical miles
    speed_kts        : vessel speed in knots over this segment
    sic              : pre-computed SIC [0..1] or None to look up

    Returns
    -------
    (total_fuel_mt, base_fuel_mt, ice_added_mt, weather_added_mt)
    """
    if dist_nm <= 0.0 or speed_kts <= 0.0:
        return 0.0, 0.0, 0.0, 0.0

    if sic is None:
        sic = lookup_sic(lat_mid, lon_mid)

    # Clamp SIC
    sic = max(0.0, min(1.0, sic))

    # Effective speed after ice speed reduction
    spd_fraction = ice_speed_fraction(sic)
    eff_speed = max(1.0, speed_kts * spd_fraction)

    # Base fuel rate (MT/h) – cubic law
    base_rate = DESIGN_FUEL_HOUR * (eff_speed / DESIGN_SPEED_KTS) ** 3

    # Ice resistance multiplier
    ice_mult = ice_resistance_factor(sic)

    # Weather resistance
    wind_u, wind_v = lookup_wind(lat_mid, lon_mid)
    wind_spd = math.hypot(wind_u, wind_v)
    weather_mult = 1.0 + wind_drag_factor(wind_spd)

    # Total rate (MT/h)
    total_rate = base_rate * ice_mult * weather_mult

    # Time for this segment (hours)
    seg_hours = dist_nm / eff_speed

    # Fuel breakdown
    base_fuel     = base_rate * seg_hours
    ice_added     = base_fuel * (ice_mult - 1.0)
    weather_added = base_fuel * (weather_mult - 1.0)
    total_fuel    = total_rate * seg_hours

    return (
        round(total_fuel, 4),
        round(base_fuel, 4),
        round(ice_added, 4),
        round(weather_added, 4),
    )


def route_fuel(
    waypoints: list[tuple[float, float]],
    speed_kts: float,
    haversine_fn,
) -> dict:
    """
    Sum fuel over all segments of a route.

    Returns a dict with:
      total_mt, base_mt, ice_added_mt, weather_added_mt, eta_hours, avg_speed_kts
    """
    total = base = ice_add = wx_add = eta_h = 0.0

    if len(waypoints) < 2:
        return {
            "total_mt": 0.0, "base_mt": 0.0,
            "ice_added_mt": 0.0, "weather_added_mt": 0.0,
            "eta_hours": 0.0, "avg_speed_kts": speed_kts,
        }

    # Pre-load SIC in batch for speed
    mid_lats = np.array(
        [(waypoints[i][0] + waypoints[i + 1][0]) / 2 for i in range(len(waypoints) - 1)],
        dtype=np.float32,
    )
    mid_lons = np.array(
        [(waypoints[i][1] + waypoints[i + 1][1]) / 2 for i in range(len(waypoints) - 1)],
        dtype=np.float32,
    )
    sics = lookup_sic_batch(mid_lats, mid_lons)

    for i, (p1, p2) in enumerate(zip(waypoints, waypoints[1:])):
        d_nm = haversine_fn(p1, p2)
        sic  = float(sics[i])

        spd_frac = ice_speed_fraction(sic)
        eff_spd  = max(1.0, speed_kts * spd_frac)

        tf, bf, ia, wa = segment_fuel(
            float(mid_lats[i]), float(mid_lons[i]), d_nm, speed_kts, sic
        )
        total   += tf
        base    += bf
        ice_add += ia
        wx_add  += wa
        eta_h   += d_nm / eff_spd

    avg_sic = float(np.mean(sics)) if len(sics) > 0 else 0.0
    max_sic = float(np.max(sics)) if len(sics) > 0 else 0.0

    return {
        "total_mt":        round(total, 1),
        "base_mt":         round(base, 1),
        "ice_added_mt":    round(ice_add, 1),
        "weather_added_mt": round(wx_add, 1),
        "eta_hours":       round(eta_h, 1),
        "avg_speed_kts":   round(speed_kts, 1),
        "avg_sic":         round(avg_sic, 3),
        "max_sic":         round(max_sic, 3),
    }


def eco_edge_cost(
    p1: tuple[float, float],
    p2: tuple[float, float],
    dist_nm: float,
    haversine_fn,
    sic: float | None = None,
) -> float:
    """
    A* edge cost for the Eco (Fuel-Efficient) profile.
    Returns predicted fuel in MT for this edge.
    Heuristic must use min_fuel_per_nm() to stay admissible.
    """
    speed = PROFILE_SPEEDS["eco"]
    mid_lat = (p1[0] + p2[0]) / 2
    mid_lon = (p1[1] + p2[1]) / 2
    if sic is None:
        sic = lookup_sic(mid_lat, mid_lon)
    tf, _, _, _ = segment_fuel(mid_lat, mid_lon, dist_nm, speed, sic)
    return tf
