"""NSIDC sea-ice concentration fetcher. Falls back to a generated 25km-style grid."""

from __future__ import annotations

import argparse
import json
import math
import os
from datetime import datetime, timezone, timedelta
from pathlib import Path

import earthaccess
import requests
import numpy as np
import xarray as xr
from dotenv import load_dotenv, find_dotenv

# Load environment variables
load_dotenv(find_dotenv(), override=True)

SAMPLE_PATH = Path(__file__).parent / "samples" / "nsidc_sic_sample.json"
CACHE_PATH = Path(__file__).parent / "cache" / "nsidc_sic.json"


def synthetic_grid(day_offset: int = 0) -> dict:
    """25km-ish polar stereographic-style lat/lon cells over Weddell Sea."""
    cells = []
    for i, lat in enumerate([ -62 + 0.4 * k for k in range(22)]):
        for j, lon in enumerate([ -60 + 0.6 * k for k in range(28)]):
            ice = 0.15 + 0.55 * (1 / (1 + math.exp((lat + 66) / 1.8)))
            ice += 0.08 * math.sin((lon + 50) / 8 + day_offset / 3)
            ice = max(0.0, min(1.0, ice))
            cells.append({"lat": round(lat, 3), "lon": round(lon, 3), "sic": round(ice, 3)})
    return {
        "grid_km": 25,
        "day_offset": day_offset,
        "cells": cells,
    }


def fetch_nsidc_live() -> str:
    """
    Downloads the daily Antarctic sea ice concentration NetCDF from G10016 V4 (NOAA@NSIDC).
    This dataset is accessed directly via HTTPS file listing from noaadata.apps.nsidc.org.
    """
    base_url = "https://noaadata.apps.nsidc.org/NOAA/G10016_V4/south/daily"
    
    # Try recent days starting from 2 days back to 10 days back (to account for lags)
    for days_back in range(2, 10):
        target_date = datetime.now(timezone.utc) - timedelta(days=days_back)
        year = target_date.strftime("%Y")
        date_str = target_date.strftime("%Y%m%d")
        filename = f"sic_pss25_{date_str}_am2_icdr_v04r00.nc"
        url = f"{base_url}/{year}/{filename}"
        
        try:
            resp = requests.get(url, timeout=30)
            if resp.status_code == 200:
                target_dir = Path(__file__).parent / "cache" / "nsidc_raw"
                os.makedirs(target_dir, exist_ok=True)
                path = target_dir / filename
                with open(path, "wb") as f:
                    f.write(resp.content)
                return str(path)
        except Exception:
            continue
            
    raise RuntimeError("No recent NSIDC G10016 file found in last 10 days")


def run() -> dict:
    live = False
    error = None
    grid = None
    
    try:
        target_file = fetch_nsidc_live()
        if not target_file:
            raise RuntimeError("No file downloaded from NSIDC")
            
        # Parse downloaded NetCDF files using xarray
        with xr.open_dataset(target_file) as ds:
            # check if latitude/longitude coordinates exist
            if 'latitude' in ds.coords and 'longitude' in ds.coords:
                lats_2d = ds['latitude'].values
                lons_2d = ds['longitude'].values
            elif 'x' in ds.coords and 'y' in ds.coords:
                xx, yy = np.meshgrid(ds['x'].values, ds['y'].values)
                try:
                    import pyproj
                    proj_in = pyproj.Proj("+proj=stere +lat_0=-90 +lat_ts=-70 +lon_0=0 +k=1 +x_0=0 +y_0=0 +a=6378273 +b=6356889.449 +units=m +no_defs")
                    proj_out = pyproj.Proj("+proj=longlat +datum=WGS84")
                    transformer = pyproj.Transformer.from_proj(proj_in, proj_out)
                    lons_2d, lats_2d = transformer.transform(xx, yy)
                except (ImportError, OSError):
                    # Pure numpy inverse polar stereographic projection (Hughes 1980 / EPSG:3412)
                    a = 6378273.0
                    b = 6356889.449
                    e2 = 1.0 - (b * b) / (a * a)
                    e = np.sqrt(e2)
                    phi_c = np.radians(70.0)
                    sin_phi_c = np.sin(phi_c)
                    m_c = np.cos(phi_c) / np.sqrt(1.0 - e2 * sin_phi_c * sin_phi_c)
                    t_c = np.tan(np.pi / 4.0 - phi_c / 2.0) / ((1.0 - e * sin_phi_c) / (1.0 + e * sin_phi_c)) ** (e / 2.0)
                    rho = np.hypot(xx, yy)
                    # avoid divide-by-zero at pole
                    safe_rho = np.where(rho == 0, 1e-10, rho)
                    t = safe_rho * t_c / (a * m_c)
                    chi = np.pi / 2.0 - 2.0 * np.arctan(t)
                    lat_rad = -(
                        chi
                        + (e2 / 2.0 + 5.0 * e2**2 / 24.0 + e2**3 / 12.0) * np.sin(2.0 * chi)
                        + (7.0 * e2**2 / 48.0 + 29.0 * e2**3 / 240.0) * np.sin(4.0 * chi)
                        + (7.0 * e2**3 / 120.0) * np.sin(6.0 * chi)
                    )
                    lons_2d = np.degrees(np.arctan2(xx, -yy))
                    lats_2d = np.where(rho == 0, -90.0, np.degrees(lat_rad))
            else:
                raise RuntimeError("No coordinate variables found (latitude/longitude or x/y)")
            
            # Identify sea ice variable
            sic_var_name = None
            for var in ['sea_ice_concentration', 'seaice_conc_cdr', 'seaice_conc', 'concentration', 'cdr_seaice_conc']:
                if var in ds.data_vars:
                    sic_var_name = var
                    break
            
            if not sic_var_name:
                for var in ds.data_vars:
                    if 'ice' in var.lower() or 'conc' in var.lower():
                        sic_var_name = var
                        break
            
            if not sic_var_name:
                sic_var_name = list(ds.data_vars.keys())[0]
                
            sic_data = ds[sic_var_name].values
            if len(sic_data.shape) == 3:
                sic_data = sic_data[0]
                
            cells = []
            for lat_target in [ -62 + 0.4 * k for k in range(22)]:
                for lon_target in [ -60 + 0.6 * k for k in range(28)]:
                    # Compute distances to find nearest grid coordinate
                    dist = (lats_2d - lat_target)**2 + (lons_2d - lon_target)**2
                    idx = np.unravel_index(np.argmin(dist), dist.shape)
                    
                    sic_val = float(sic_data[idx])
                    # Normalize sea ice concentration value (0.0 to 1.0)
                    if math.isnan(sic_val) or sic_val > 100.0 or sic_val < 0.0:
                        sic_val = 0.0
                    else:
                        if sic_val > 1.0:
                            sic_val = sic_val / 100.0
                            
                    cells.append({
                        "lat": round(lat_target, 3),
                        "lon": round(lon_target, 3),
                        "sic": round(sic_val, 3)
                    })
                    
            grid = {
                "grid_km": 25,
                "day_offset": 0,
                "cells": cells,
            }
            live = True
    except Exception as exc:
        error = str(exc)
        # Load sample if exists, else generate synthetic_grid
        if SAMPLE_PATH.exists():
            try:
                grid = json.loads(SAMPLE_PATH.read_text(encoding="utf-8"))
            except Exception:
                grid = synthetic_grid()
        else:
            grid = synthetic_grid()
            SAMPLE_PATH.parent.mkdir(parents=True, exist_ok=True)
            SAMPLE_PATH.write_text(json.dumps(grid, indent=2), encoding="utf-8")
            
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "live": live,
        "error": error,
        **grid,
    }
    CACHE_PATH.write_text(json.dumps(payload), encoding="utf-8")
    return {"status": "LIVE" if live else "FALLBACK", "cells": len(grid["cells"]), "error": error}


def main() -> None:
    argparse.ArgumentParser().parse_args()
    print(json.dumps(run(), indent=2))


if __name__ == "__main__":
    main()
