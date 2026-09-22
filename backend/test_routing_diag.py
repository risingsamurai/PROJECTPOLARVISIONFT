import math
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))

from db.models import list_icebergs
from ml import astar_router

start = (-68.35, -52.45)
dest = (-64.5496, -43.1029)
bergs = list_icebergs()

print(f"Total bergs in DB: {len(bergs)}")
print("Lat range:", min(b['lat'] for b in bergs), "to", max(b['lat'] for b in bergs))
print("Lon range:", min(b['lon'] for b in bergs), "to", max(b['lon'] for b in bergs))

print("\nBergs sorted by distance from route start:")
for b in sorted(bergs, key=lambda x: astar_router._haversine_nm(start, (x['lat'], x['lon'])))[:15]:
    d_start = astar_router._haversine_nm(start, (b['lat'], b['lon']))
    d_dest = astar_router._haversine_nm(dest, (b['lat'], b['lon']))
    print(f"  {b['name']}: lat={b['lat']:.2f}, lon={b['lon']:.2f} -> {d_start:.1f} NM from start, {d_dest:.1f} NM from dest")

print("\n=== Sea ice concentration values along start -> dest ===")
for t in [0.0, 0.2, 0.4, 0.6, 0.8, 1.0]:
    lat = start[0] + (dest[0] - start[0]) * t
    lon = start[1] + (dest[1] - start[1]) * t
    ice = astar_router._ice_at(lat, lon)
    print(f"  t={t:.1f}: lat={lat:.2f}, lon={lon:.2f} -> ice concentration = {ice:.3f}")
