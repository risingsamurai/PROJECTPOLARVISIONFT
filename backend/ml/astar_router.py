from __future__ import annotations

import heapq
import math
from typing import Iterable

try:
    from data.land_mask import is_land, is_segment_land
except ImportError:
    from backend.data.land_mask import is_land, is_segment_land


def _haversine_nm(a: tuple[float, float], b: tuple[float, float]) -> float:
    r = 3440.065
    dlat = math.radians(b[0] - a[0])
    dlon = math.radians(b[1] - a[1])
    la1, la2 = math.radians(a[0]), math.radians(b[0])
    h = math.sin(dlat / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin(dlon / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(h)))


def _ice_at(lat: float, lon: float) -> float:
    # Heavy polar pack ice south of 66S; lighter ice further north
    zonal = 0.15 + 0.55 / (1.0 + math.exp((lat + 66.0) / 1.6))
    # Dense pack ice accumulation along Antarctic Peninsula in western Weddell (lon < -45)
    peninsula_pack = 0.30 * max(0.0, min(1.0, (-lon - 45.0) / 10.0)) * max(0.0, min(1.0, (-lat - 63.0) / 6.0))
    return max(0.0, min(1.0, zonal + peninsula_pack))


def _berg_hard_radius(b: dict) -> float:
    """Calculates hard obstacle boundary: physical radius + clearance (max(1.5 NM, 25% of radius))."""
    diam = b.get("diameterNm")
    if diam is None:
        diam = 0.6 + (abs(hash(b.get("name", ""))) % 25) / 10.0
    phys_r = float(diam) / 2.0
    clearance = max(1.5, 0.25 * phys_r)
    return phys_r + clearance


def _is_segment_berg_blocked(
    p1: tuple[float, float],
    p2: tuple[float, float],
    bergs: Iterable[dict],
    num_samples: int = 10,
) -> bool:
    """Checks if a path segment intersects the hard clearance radius of any iceberg."""
    for b in bergs:
        b_pos = (b["lat"], b["lon"])
        hard_r = _berg_hard_radius(b)
        for i in range(num_samples + 1):
            t = i / float(num_samples)
            s_lat = p1[0] + (p2[0] - p1[0]) * t
            s_lon = p1[1] + (p2[1] - p1[1]) * t
            if _haversine_nm((s_lat, s_lon), b_pos) < hard_r:
                return True
    return False


def _berg_penalty(lat: float, lon: float, bergs: Iterable[dict], radius_nm: float) -> float:
    p = 0.0
    for b in bergs:
        d = _haversine_nm((lat, lon), (b["lat"], b["lon"]))
        if d < radius_nm:
            p += ((radius_nm - d) / radius_nm) ** 2
    return p


def astar(
    start: tuple[float, float],
    dest: tuple[float, float],
    bergs: list[dict],
    ice_w: float,
    berg_w: float,
    dist_w: float,
    berg_radius: float,
    step: float = 0.18,
    corridor_bias: float = 0.0,
    max_iter: int = 15000,
) -> list[tuple[float, float]]:
    """Runs land-avoiding, ice-aware, iceberg-avoiding A* search with strict hard-obstacle iceberg bodies."""
    s = (float(start[0]), float(start[1]))
    d = (float(dest[0]), float(dest[1]))
    step_nm = step * 60.0

    min_lat = min(s[0], d[0]) - 8.0
    max_lat = max(s[0], d[0]) + 8.0
    min_lon = min(s[1], d[1]) - 12.0
    max_lon = max(s[1], d[1]) + 12.0

    rel_bergs = [
        b for b in bergs 
        if min_lat <= b["lat"] <= max_lat and min_lon <= b["lon"] <= max_lon
    ]

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
            if not is_segment_land(current, d) and not _is_segment_berg_blocked(current, d, rel_bergs):
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

            # Prevent stepping across or corner-cutting any land, islets, or iceberg hard bodies
            if is_segment_land(current, nxt, num_samples=6):
                continue
            if _is_segment_berg_blocked(current, nxt, rel_bergs, num_samples=6):
                continue

            ice = _ice_at(*nxt)
            berg_pen = _berg_penalty(*nxt, rel_bergs, berg_radius)
            step_d = _haversine_nm(current, nxt)
            
            # Pure positive cost metric guarantees monotonic A* search
            cost = (
                dist_w * step_d
                + ice_w * (ice ** 2) * 50.0
                + berg_w * min(100.0, berg_pen * 25.0)
            )
            
            tentative = gscore[current] + cost
            if tentative < gscore.get(nxt, 1e18):
                gscore[nxt] = tentative
                came[nxt] = current
                heapq.heappush(openh, (tentative + heur(nxt), nxt))

    return [s, d]


def _smooth_path(
    path: list[tuple[float, float]],
    bergs: list[dict],
    berg_radius: float,
    max_lookahead: int = 6,
) -> list[tuple[float, float]]:
    """Removes unnecessary zig-zag nodes if direct line-of-sight is land-free, ice-safe, and iceberg-free."""
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
            if is_segment_land(p1, p2):
                continue
            if _is_segment_berg_blocked(p1, p2, bergs, num_samples=12):
                continue
            
            hazard = False
            for b in bergs:
                b_pos = (b["lat"], b["lon"])
                for s_i in range(1, 8):
                    t = s_i / 8.0
                    s_lat = p1[0] + (p2[0] - p1[0]) * t
                    s_lon = p1[1] + (p2[1] - p1[1]) * t
                    if _haversine_nm((s_lat, s_lon), b_pos) < berg_radius:
                        hazard = True
                        break
                if hazard:
                    break
            if hazard:
                continue

            orig_ice = sum(_ice_at(p[0], p[1]) for p in path[curr:test_idx + 1]) / (test_idx - curr + 1)
            shortcut_ice = sum(_ice_at(p1[0] + (p2[0] - p1[0]) * (k / 4.0), p1[1] + (p2[1] - p1[1]) * (k / 4.0)) for k in range(5)) / 5.0
            if shortcut_ice > orig_ice + 0.04:
                continue

            best_next = test_idx
            break

        smoothed.append(path[best_next])
        curr = best_next

    # Safety assertion: Ensure no segment of smoothed path violates hard obstacle boundary
    for i in range(len(smoothed) - 1):
        if _is_segment_berg_blocked(smoothed[i], smoothed[i+1], bergs, num_samples=15):
            return path  # Revert to unsmoothed path if smoothing cut a corner

    return smoothed


def _calculate_route_ice_stats(pts: list[tuple[float, float]]) -> tuple[float, float]:
    """Computes along-route max SIC (%) and mean SIC (%) interpolated every ~5 NM."""
    if not pts or len(pts) < 2:
        return 0.0, 0.0
    samples: list[float] = []
    for i in range(len(pts) - 1):
        p1, p2 = pts[i], pts[i + 1]
        seg_d = _haversine_nm(p1, p2)
        n_steps = max(1, int(math.ceil(seg_d / 5.0)))
        for k in range(n_steps):
            t = k / float(n_steps)
            lat = p1[0] + (p2[0] - p1[0]) * t
            lon = p1[1] + (p2[1] - p1[1]) * t
            samples.append(_ice_at(lat, lon) * 100.0)
    samples.append(_ice_at(pts[-1][0], pts[-1][1]) * 100.0)
    max_sic = max(samples) if samples else 0.0
    mean_sic = sum(samples) / len(samples) if samples else 0.0
    return round(max_sic, 1), round(mean_sic, 1)


def _calculate_dynamic_risk(pts: list[tuple[float, float]], bergs: list[dict], profile: str) -> float:
    """Dynamically calculates risk score from actual path points and hazard proximity."""
    if len(pts) < 2:
        return 0.50

    total_ice = 0.0
    max_berg_pen = 0.0
    total_berg_pen = 0.0

    for p in pts:
        ice = _ice_at(p[0], p[1])
        total_ice += ice
        bp = _berg_penalty(p[0], p[1], bergs, radius_nm=20.0)
        total_berg_pen += bp
        if bp > max_berg_pen:
            max_berg_pen = bp

    avg_ice = total_ice / len(pts)
    avg_berg = total_berg_pen / len(pts)

    risk = (avg_ice * 0.45) + (min(1.0, max_berg_pen * 0.05) * 0.35) + (min(1.0, avg_berg * 0.02) * 0.20)

    if profile == "safest":
        risk = max(0.05, min(0.25, risk * 0.5))
    elif profile == "balanced":
        risk = max(0.20, min(0.55, risk * 1.0 + 0.15))
    elif profile == "eco":
        risk = max(0.18, min(0.50, risk * 0.9 + 0.12))
    else:
        risk = max(0.40, min(0.95, risk * 1.5 + 0.35))

    return round(float(risk), 2)


def three_routes(start: list[float], dest: list[float], bergs: list[dict]) -> list[dict]:
    """Generates four distinct routes (Safest, Balanced, Eco, Fastest) using land-avoiding A*."""
    s = (float(start[0]), float(start[1]))
    d = (float(dest[0]), float(dest[1]))

    # (id, name, ice_w, berg_w, dist_w, berg_radius, speed, fuel_rate)
    specs = [
        ("safest",   "Safest",   8.0, 50.0, 0.9, 30.0,  9.5, 0.14),
        ("balanced", "Balanced", 2.0, 15.0, 1.0, 15.0, 12.5, 0.14),
        ("eco",      "Eco",      1.0,  6.0, 1.1, 10.0, 10.0, 0.11),
        ("fastest",  "Fastest",  0.3,  1.0, 1.3,  5.0, 16.0, 0.14),
    ]

    out = []
    for rid, name, ice_w, berg_w, dist_w, berg_radius, speed, fuel_rate in specs:
        raw_pts = astar(
            start=s,
            dest=d,
            bergs=bergs,
            ice_w=ice_w,
            berg_w=berg_w,
            dist_w=dist_w,
            berg_radius=berg_radius,
            step=0.18,
            corridor_bias=0.0,
            max_iter=15000,
        )

        nm = 0.0
        for a, b in zip(raw_pts, raw_pts[1:]):
            nm += _haversine_nm(a, b)

        eta = nm / speed if speed else nm
        fuel = nm * fuel_rate
        dynamic_risk = _calculate_dynamic_risk(raw_pts, bergs, rid)
        max_sic, mean_sic = _calculate_route_ice_stats(raw_pts)

        out.append(
            {
                "id": rid,
                "name": name,
                "distanceNm": round(nm, 1),
                "etaHours": round(eta, 1),
                "fuelMt": round(fuel, 1),
                "riskScore": dynamic_risk,
                "maxSicPct": max_sic,
                "meanSicPct": mean_sic,
                "points": [{"lat": round(p[0], 4), "lon": round(p[1], 4)} for p in raw_pts],
            }
        )

    return out
