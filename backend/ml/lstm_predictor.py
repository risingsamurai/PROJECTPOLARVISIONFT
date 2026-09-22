"""Iceberg 24/48/72h trajectory predictions using a trained PyTorch Hybrid LSTM.

Reconstructs the past 14 days of history using SQLite database logs,
falling back to physics-informed backward simulation if history is incomplete,
and uses static iceberg size (NM) alongside trajectory features for ML prediction.
"""

from __future__ import annotations

import logging
import math
import os
import sqlite3
from pathlib import Path
import numpy as np
import xarray as xr

logger = logging.getLogger(__name__)

try:
    import torch
    import torch.nn as nn
    HAS_TORCH = True
    base_class = nn.Module
except (ImportError, OSError):
    torch = None
    nn = None
    HAS_TORCH = False
    base_class = object

# Paths
ROOT = Path(__file__).resolve().parents[2]
MODEL_PATH = Path(__file__).resolve().parent / "lstm_weights.pt"
ERA5_CACHE = ROOT / "backend" / "data" / "cache" / "era5_latest.nc"
DB_PATH = ROOT / "backend" / "polaris.db"


class HybridIcebergLSTM(base_class):
    def __init__(self, seq_input_size=6, static_input_size=1, hidden_size=32, output_size=6):
        if HAS_TORCH:
            super().__init__()
            self.lstm = nn.LSTM(seq_input_size, hidden_size, num_layers=1, batch_first=True)
            self.size_fc = nn.Linear(static_input_size, 8)
            self.relu = nn.ReLU()
            self.fc1 = nn.Linear(hidden_size + 8, 32)
            self.fc2 = nn.Linear(32, output_size)

    def forward(self, x_seq, x_static):
        if HAS_TORCH:
            out, _ = self.lstm(x_seq)
            last_out = out[:, -1, :]
            size_emb = self.relu(self.size_fc(x_static))
            combined = torch.cat([last_out, size_emb], dim=1)
            h = self.relu(self.fc1(combined))
            preds = self.fc2(h)
            return preds
        return None


_model = None


def get_model():
    global _model
    if _model is None:
        _model = HybridIcebergLSTM()
        if MODEL_PATH.exists():
            try:
                _model.load_state_dict(torch.load(MODEL_PATH, map_location=torch.device('cpu')))
            except Exception as e:
                logger.exception(f"Failed to load LSTM weights from {MODEL_PATH}: {type(e).__name__}: {e}")
        _model.eval()
    return _model


def get_acc_current(lat: float) -> tuple[float, float]:
    if lat >= -60.0:
        u = 0.15
    elif lat <= -75.0:
        u = 0.02
    else:
        u = 0.02 + (0.15 - 0.02) * (lat - (-75.0)) / 15.0
    u = max(0.01, min(0.25, u))
    v = 0.01
    return u, v


def get_era5_wind(ds: xr.Dataset | None, lat: float, lon: float) -> tuple[float, float]:
    if ds is None:
        return 3.6, -2.2
    try:
        # Get actual bounds from the dataset dynamically
        lat_name = 'latitude' if 'latitude' in ds.coords else 'lat'
        lon_name = 'longitude' if 'longitude' in ds.coords else 'lon'
        
        lat_bounds = float(ds[lat_name].min()), float(ds[lat_name].max())
        lon_bounds = float(ds[lon_name].min()), float(ds[lon_name].max())
        
        clamped_lat = max(lat_bounds[0], min(lat_bounds[1], lat))
        clamped_lon = max(lon_bounds[0], min(lon_bounds[1], lon))
        
        pt = ds.sel({lat_name: clamped_lat, lon_name: clamped_lon}, method="nearest")
        u = float(pt['u10'].mean()) if 'u10' in pt else 0.0
        v = float(pt['v10'].mean()) if 'v10' in pt else 0.0
        return u, v
    except Exception:
        return 3.6, -2.2


def predict(
    lat: float,
    lon: float,
    name: str | None = None,
    size_nm: float | None = None,
    hours: list[int] | None = None
) -> list[dict]:
    hours = hours or [24, 48, 72]

    # Resolve size_nm if not explicitly passed
    if size_nm is None:
        if name:
            size_nm = 0.6 + (abs(hash(name)) % 25) / 10.0
        else:
            size_nm = 1.5

    # 1. Fetch history from database
    real_history = []
    if name and DB_PATH.exists():
        try:
            with sqlite3.connect(DB_PATH) as conn:
                conn.row_factory = sqlite3.Row
                rows = conn.execute(
                    "SELECT lat, lon FROM iceberg_history WHERE name = ? ORDER BY fetched_at DESC LIMIT 14",
                    (name,)
                ).fetchall()
                real_history = [dict(r) for r in rows]
        except Exception:
            pass

    # 2. Open ERA5 cache to extract winds
    ds = None
    if ERA5_CACHE.exists():
        try:
            ds = xr.open_dataset(ERA5_CACHE)
        except Exception:
            pass

    # 3. Build sequence of length 14 (latest to oldest, then reverse)
    seq = []
    sim_start_lat = lat
    sim_start_lon = lon

    for pt in real_history:
        plat, plon = pt["lat"], pt["lon"]
        w_u, w_v = get_era5_wind(ds, plat, plon)
        c_u, c_v = get_acc_current(plat)
        seq.append([plat, plon, w_u, w_v, c_u, c_v])
        sim_start_lat, sim_start_lon = plat, plon

    WIND_DRAG = 0.02
    while len(seq) < 14:
        wind_u, wind_v = get_era5_wind(ds, sim_start_lat, sim_start_lon)
        cur_u, cur_v = get_acc_current(sim_start_lat)

        # Calculate daily drift vector (forward)
        vel_u = WIND_DRAG * wind_u + cur_u
        vel_v = WIND_DRAG * wind_v + cur_v

        dx = vel_u * 86400.0
        dy = vel_v * 86400.0

        dlat = dy / 111320.0
        dlon = dx / (111320.0 * math.cos(math.radians(sim_start_lat)))

        sim_start_lat = sim_start_lat - dlat
        sim_start_lon = sim_start_lon - dlon

        seq.append([sim_start_lat, sim_start_lon, wind_u, wind_v, cur_u, cur_v])

    if ds is not None:
        try:
            ds.close()
        except Exception:
            pass

    seq = seq[:14]
    seq.reverse()

    seq_arr = np.array(seq, dtype=np.float32)
    last_lat = seq_arr[-1, 0]
    last_lon = seq_arr[-1, 1]

    seq_arr[:, 0] -= last_lat
    seq_arr[:, 1] -= last_lon

    # 4. Run model inference
    if HAS_TORCH and torch is not None:
        try:
            x_seq = torch.tensor(seq_arr).unsqueeze(0)  # (1, 14, 6)
            size_norm = float(size_nm) / 10.0
            x_static = torch.tensor([[size_norm]], dtype=torch.float32)  # (1, 1)

            model = get_model()
            with torch.no_grad():
                preds_tensor = model(x_seq, x_static)
                if preds_tensor is not None:
                    preds = preds_tensor.squeeze(0).numpy()
                else:
                    preds = np.zeros(6, dtype=np.float32)
        except Exception as e:
            logger.exception(f"LSTM inference failed for iceberg {name}: {type(e).__name__}: {e}")
            preds = np.zeros(6, dtype=np.float32)
    else:
        preds = np.zeros(6, dtype=np.float32)

    pred_positions = {
        24: (float(last_lat + preds[0]), float(last_lon + preds[1])),
        48: (float(last_lat + preds[2]), float(last_lon + preds[3])),
        72: (float(last_lat + preds[4]), float(last_lon + preds[5])),
    }

    pts = []
    for h in hours:
        p_lat, p_lon = pred_positions.get(h, (lat, lon))
        uncertainty = round(4.5 * math.sqrt(h / 24), 2)
        pts.append({
            "hour": h,
            "lat": round(p_lat, 4),
            "lon": round(p_lon, 4),
            "uncertainty_nm": uncertainty
        })

    return pts
