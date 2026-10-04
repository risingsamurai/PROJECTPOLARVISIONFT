import sys
from pathlib import Path
sys.path.append(str(Path(__file__).resolve().parent.parent))

from data.nsidc_fetcher import load_raster_data, sample_sic_bilinear, get_latest_cached_geotiff
import numpy as np

raster = load_raster_data()
print("=== NSIDC RASTER METADATA ===")
print("Status:", raster.get("status"))
print("Data Date:", raster.get("data_date"))
print("File:", raster.get("filepath"))
print("Grid Shape:", raster["data"].shape if "data" in raster else None)
print("Resolution (EPSG:3412): 25km")

# 8 specific test points across the Weddell Sea domain:
points = [
    ("Open Water (North Drake/Scotia)", -55.0, -50.0),
    ("Open Water (North Weddell)", -58.0, -45.0),
    ("Marginal Ice Zone (Mid Weddell)", -63.0, -48.0),
    ("Pack Ice (Central Weddell)", -67.0, -45.0),
    ("Heavy Pack Ice (South Weddell)", -72.0, -40.0),
    ("Near Antarctic Peninsula (North)", -63.5, -57.0),
    ("Near Antarctic Peninsula (Mid)", -65.5, -60.0),
    ("Near Larsen Ice Shelf", -68.0, -62.0),
]

print("\n=== SIC SAMPLES AT 8 LOCATIONS ===")
print(f"{'Location':35s} | {'Lat':>7s} {'Lon':>7s} | {'Bilinear SIC %':>15s} | {'Raw Grid SIC %':>15s}")
print("-" * 85)

for name, lat, lon in points:
    # 1. Bilinear sampling from nsidc_fetcher (returns 0.0 .. 1.0 fraction)
    b_val = sample_sic_bilinear(np.array([lat]), np.array([lon]))[0]
    b_str = f"{b_val * 100.0:.1f}%" if b_val is not None and not np.isnan(b_val) else "Land / Flag"
    
    # 2. Nearest raw cell in raster
    try:
        transformer = raster.get("transformer")
        inv_t = raster.get("inv_transform")
        arr = raster.get("data_pct")
        xs, ys = transformer.transform(np.array([lon]), np.array([lat]))
        cols, rows = inv_t * (xs, ys)
        r_int, c_int = int(round(rows[0])), int(round(cols[0]))
        if 0 <= r_int < arr.shape[0] and 0 <= c_int < arr.shape[1]:
            raw_v = arr[r_int, c_int]
            raw_str = f"{raw_v:.1f}%" if not np.isnan(raw_v) else "Land / Flag"
        else:
            raw_str = "Out of Bounds"
    except Exception as e:
        raw_str = f"Err: {e}"
        
    print(f"{name:35s} | {lat:7.2f} {lon:7.2f} | {b_str:>15s} | {raw_str:>15s}")
