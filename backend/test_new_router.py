import math
import heapq
from typing import Iterable
import shapefile
from pathlib import Path
from shapely.geometry import shape, Point, LineString
from shapely.strtree import STRtree
import functools

# 1. Real Vector Land Avoidance from Natural Earth 10m shapefile
SHP_PATH = Path("backend/data/cache/ne_10m_land/ne_10m_land.shp")
sf = shapefile.Reader(str(SHP_PATH))
land_geoms = [shape(s.__geo_interface__) for s in sf.shapes() if s.bbox[1] < -50.0 and shape(s.__geo_interface__).is_valid]
tree = STRtree(land_geoms)

@functools.lru_cache(maxsize=100000)
def is_land(lat: float, lon: float) -> bool:
    if lat > -50.0:
        return False
    # Weddell Sea open ocean fast-path:
    # Between lat -72 and -58, and lon -52 and -20 is guaranteed open deep water
    if -72.0 < lat < -58.0 and -51.5 < lon < -25.0:
        return False
    p = Point(lon, lat)
    hits = tree.query(p)
    return any(land_geoms[idx].contains(p) for idx in hits)

def is_segment_land(p1: tuple[float, float], p2: tuple[float, float]) -> bool:
    if p1[0] > -50.0 and p2[0] > -50.0:
        return False
    # If both points are in open Weddell sea, segment is clear
    if (-72.0 < p1[0] < -58.0 and -51.5 < p1[1] < -25.0 and
        -72.0 < p2[0] < -58.0 and -51.5 < p2[1] < -25.0):
        return False
    ls = LineString([(p1[1], p1[0]), (p2[1], p2[0])])
    hits = tree.query(ls)
    return any(land_geoms[idx].intersects(ls) for idx in hits)

# 2. Great-Circle Distance
def _haversine_nm(a: tuple[float, float], b: tuple[float, float]) -> float:
    r = 3440.065
    dlat = math.radians(b[0] - a[0])
    dlon = math.radians(b[1] - a[1])
    la1, la2 = math.radians(a[0]), math.radians(b[0])
    h = math.sin(dlat / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin(dlon / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(h)))

# 3. 2D Ice Concentration Model (Weddell Sea & Southern Ocean)
def _ice_at(lat: float, lon: float) -> float:
    # Base zonal gradient (denser polar south of 65°S)
    zonal = 0.15 + 0.50 / (1.0 + math.exp((lat + 66.0) / 1.6))
    # Western Weddell pack ice accumulation along Antarctic Peninsula (lon < -48)
    peninsula_pack = 0.28 * max(0.0, min(1.0, (-lon - 45.0) / 10.0)) * max(0.0, min(1.0, (-lat - 63.0) / 6.0))
    return max(0.0, min(1.0, zonal + peninsula_pack))

# 4. Iceberg Penalty
def _berg_penalty(lat: float, lon: float, bergs: Iterable[dict], radius_nm: float) -> float:
    p = 0.0
    for b in bergs:
        d = _haversine_nm((lat, lon), (b["lat"], b["lon"]))
        if d < radius_nm:
            p += ((radius_nm - d) / radius_nm) ** 2
    return p

# 5. Smart Path Smoothing
def _smooth_path(path: list[tuple[float, float]], bergs: list[dict], berg_radius: float, max_lookahead: int = 6) -> list[tuple[float, float]]:
    if len(path) <= 2:
        return path
    smoothed = [path[0]]
    curr = 0
    while curr < len(path) - 1:
        best_next = curr + 1
        max_idx = min(len(path) - 1, curr + max_lookahead)
        for test_idx in range(max_idx, curr + 1, -1):
            p1 = path[curr]
            p2 = path[test_idx]
            
            # Check hard land constraint
            if is_segment_land(p1, p2):
                continue
                
            # Check iceberg clearance
            hazard = False
            for b in bergs:
                b_pos = (b["lat"], b["lon"])
                for s_i in range(1, 10):
                    t = s_i / 10.0
                    s_lat = p1[0] + (p2[0] - p1[0]) * t
                    s_lon = p1[1] + (p2[1] - p1[1]) * t
                    if _haversine_nm((s_lat, s_lon), b_pos) < berg_radius:
                        hazard = True
                        break
                if hazard:
                    break
            if hazard:
                continue

            # Check that shortcut doesn't cut through significantly worse ice
            orig_ice = sum(_ice_at(p[0], p[1]) for p in path[curr:test_idx + 1]) / (test_idx - curr + 1)
            shortcut_ice = sum(_ice_at(p1[0] + (p2[0] - p1[0]) * (k / 5.0), p1[1] + (p2[1] - p1[1]) * (k / 5.0)) for k in range(6)) / 6.0
            if shortcut_ice > orig_ice + 0.05:
                continue

            best_next = test_idx
            break

        smoothed.append(path[best_next])
        curr = best_next
    return smoothed

# 6. A* Search
def astar(
    start: tuple[float, float],
    dest: tuple[float, float],
    bergs: list[dict],
    ice_w: float,
    berg_w: float,
    dist_w: float,
    berg_radius: float,
    corridor_bias: float = 0.0,
    step: float = 0.20,
    max_iter: int = 10000,
) -> list[tuple[float, float]]:
    s = (float(start[0]), float(start[1]))
    d = (float(dest[0]), float(dest[1]))
    step_nm = step * 60.0

    min_lat = min(s[0], d[0]) - 6.0
    max_lat = max(s[0], d[0]) + 6.0
    min_lon = min(s[1], d[1]) - 10.0
    max_lon = max(s[1], d[1]) + 10.0

    rel_bergs = [
        b for b in bergs 
        if min_lat <= b["lat"] <= max_lat and min_lon <= b["lon"] <= max_lon
    ]

    dx = d[0] - s[0]
    dy = d[1] - s[1]
    length = math.hypot(dx, dy) or 1.0

    def heur(n: tuple[float, float]) -> float:
        return _haversine_nm(n, d) * dist_w

    openh: list[tuple[float, tuple[float, float]]] = [(heur(s), s)]
    came: dict[tuple[float, float], tuple[float, float] | None] = {s: None}
    gscore = {s: 0.0}
    visited: set[tuple[float, float]] = set()

    dirs = [
        (step, 0),
        (-step, 0),
        (0, step),
        (0, -step),
        (step, step),
        (step, -step),
        (-step, step),
        (-step, -step),
    ]

    for _ in range(max_iter):
        if not openh:
            break
        _, current = heapq.heappop(openh)
        if current in visited:
            continue
        visited.add(current)

        if _haversine_nm(current, d) < step_nm * 1.5:
            if not is_segment_land(current, d):
                path = [d]
                curr: tuple[float, float] | None = current
                while curr is not None:
                    path.append(curr)
                    curr = came[curr]
                path.reverse()
                return _smooth_path(path, rel_bergs, berg_radius)

        for dlat, dlon in dirs:
            nxt = (round(current[0] + dlat, 3), round(current[1] + dlon, 3))
            
            if nxt in visited or is_land(nxt[0], nxt[1]):
                continue

            ice = _ice_at(*nxt)
            berg_pen = _berg_penalty(*nxt, rel_bergs, berg_radius)
            
            # Signed perpendicular deviation: positive is East/North-East, negative is West/South-West
            perp = (dy * (nxt[0] - s[0]) - dx * (nxt[1] - s[1])) / length
            bias_cost = -perp * corridor_bias  # encourages positive perp if corridor_bias > 0
            
            step_d = _haversine_nm(current, nxt)
            cost = (
                dist_w * step_d
                + ice_w * (ice ** 2) * 50.0
                + berg_w * min(100.0, berg_pen * 20.0)
                + bias_cost
            )
            
            tentative = gscore[current] + cost
            if tentative < gscore.get(nxt, 1e18):
                gscore[nxt] = tentative
                came[nxt] = current
                heapq.heappush(openh, (tentative + heur(nxt), nxt))

    return [s, d]

# 7. Evaluate
start = (-68.35, -52.45)
dest = (-64.5496, -43.1029)
from db.models import list_icebergs
bergs = list_icebergs()

specs = [
    ("safest", "Safest", 12.0, 60.0, 0.8, 30.0, 0.4, 9.5),
    ("balanced", "Balanced", 3.0, 15.0, 1.0, 15.0, 0.0, 12.5),
    ("fastest", "Fastest", 0.3, 2.0, 1.4, 5.0, -0.2, 16.0),
]

print("=== Running New Router Evaluation ===", flush=True)
direct = _haversine_nm(start, dest)
print(f"Direct Great-Circle: {direct:.2f} NM\n", flush=True)

for rid, name, ice_w, berg_w, dist_w, berg_radius, bias, speed in specs:
    pts = astar(start, dest, bergs, ice_w, berg_w, dist_w, berg_radius, corridor_bias=bias, step=0.18)
    nm = sum(_haversine_nm(a, b) for a, b in zip(pts, pts[1:]))
    fuel = nm * 0.14
    eta = nm / speed
    avg_ice = sum(_ice_at(p[0], p[1]) for p in pts) / len(pts)
    print(f"Profile: {name} ({rid})", flush=True)
    print(f"  Distance: {nm:.1f} NM (Direct + {nm - direct:.1f} NM)", flush=True)
    print(f"  ETA: {eta:.1f} hrs", flush=True)
    print(f"  Fuel: {fuel:.1f} MT", flush=True)
    print(f"  Average Ice Exposure: {avg_ice:.3f}", flush=True)
    print(f"  Waypoints count: {len(pts)}", flush=True)
    print(f"  Waypoints sample: {pts[:3]} ... {pts[-3:]}\n", flush=True)
