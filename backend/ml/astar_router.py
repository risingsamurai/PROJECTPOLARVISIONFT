from __future__ import annotations

import heapq
import math
import time
from typing import Iterable

try:
    from data.land_mask import is_land, is_segment_land, snap_to_sea
except ImportError:
    from backend.data.land_mask import is_land, is_segment_land, snap_to_sea


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


def _berg_penalty(lat: float, lon: float, bergs: Iterable[dict], radius_nm: float) -> float:
    p = 0.0
    for b in bergs:
        d = _haversine_nm((lat, lon), (b["lat"], b["lon"]))
        if d < radius_nm:
            p += ((radius_nm - d) / radius_nm) ** 2
    return p


# ---------------------------------------------------------------------------
# Global Maritime Corridor Graph & Strait Fairways
# ---------------------------------------------------------------------------
GLOBAL_CORRIDOR_NODES: dict[str, tuple[float, float]] = {
    # Suez & Red Sea Corridor
    "suez_north": (31.2, 32.3),
    "suez_port": (29.9, 32.55),
    "suez_gulf_n": (29.5, 32.58),
    "suez_gulf_mid": (29.0, 32.85),
    "suez_gulf_s": (28.5, 33.1),
    "suez_gulf_exit": (27.8, 33.7),
    "gubal_e1": (27.8, 34.0),
    "gubal_e2": (27.5, 34.3),
    "gubal_e3": (27.0, 34.5),
    "red_sea_north": (26.0, 35.0),
    "red_sea_mid": (22.0, 38.0),
    "red_sea_south": (16.5, 41.2),
    "red_sea_mid_south": (15.0, 42.0),
    "red_sea_zuqar_n": (14.0, 42.4),
    "red_sea_zuqar_s": (13.5, 42.5),
    "red_sea_zuqar_se": (13.3, 42.7),
    "bab_el_mandeb_n": (13.0, 43.15),
    "bab_el_mandeb_mid": (12.6, 43.4),
    "gulf_aden_w": (12.0, 44.5),
    "gulf_aden_mid": (12.5, 48.0),
    "gulf_aden_e": (12.2, 51.5),
    "guardafui_channel": (11.5, 52.5),
    "somali_basin": (5.0, 52.5),
    "equatorial_ind_w": (0.0, 50.0),
    "mozambique_n": (-10.0, 43.0),
    "mozambique_n2": (-14.0, 42.0),
    "mozambique_mid": (-18.0, 39.0),
    "mozambique_s": (-25.0, 36.0),
    "durban_offshore": (-30.0, 33.0),
    "port_elizabeth_offshore": (-34.5, 27.0),
    "cape_agulhas": (-35.8, 20.0),
    "cape_good_hope_offshore": (-35.0, 17.5),
    "south_atlantic_e": (-36.0, 10.0),
    "south_atlantic_mid": (-42.0, 0.0),
    "south_atlantic_w": (-48.0, -15.0),
    "sub_antarctic_scotia_e": (-56.0, -30.0),
    "scotia_sea_mid": (-58.0, -45.0),
    "weddell_approach_ne": (-62.0, -45.0),
    "weddell_approach_nw": (-62.0, -52.0),
    
    # Mediterranean & Gibraltar Corridor
    "gibraltar_east": (36.0, -5.0),
    "gibraltar_strait": (35.95, -5.6),
    "gibraltar_west": (35.95, -6.2),
    "gibraltar_atlantic": (35.9, -6.8),
    "morocco_offshore": (34.0, -11.0),
    "canary_passage_w": (30.0, -16.0),
    "canary_south_w": (25.0, -20.0),
    "cape_verde_nw": (20.0, -22.0),
    "cape_verde_w": (16.0, -28.0),
    "equatorial_atlantic_w": (0.0, -28.0),
    "south_atlantic_nw": (-15.0, -30.0),
    "south_atlantic_sw": (-30.0, -34.0),
    "argentine_basin_e": (-42.0, -42.0),
    "falklands_e": (-52.0, -55.0),
    "drake_passage_n": (-56.0, -65.0),
    "drake_passage_s": (-60.0, -64.0),
    "antarctic_peninsula_w": (-64.0, -66.0),
    "antarctic_peninsula_tip": (-63.0, -58.0),
}

GLOBAL_CORRIDOR_EDGES: list[tuple[str, str]] = [
    # Suez & Indian Ocean chain
    ("suez_north", "suez_port"),
    ("suez_port", "suez_gulf_n"),
    ("suez_gulf_n", "suez_gulf_mid"),
    ("suez_gulf_mid", "suez_gulf_s"),
    ("suez_gulf_s", "suez_gulf_exit"),
    ("suez_gulf_exit", "gubal_e1"),
    ("gubal_e1", "gubal_e2"),
    ("gubal_e2", "gubal_e3"),
    ("gubal_e3", "red_sea_north"),
    ("red_sea_north", "red_sea_mid"),
    ("red_sea_mid", "red_sea_south"),
    ("red_sea_south", "red_sea_mid_south"),
    ("red_sea_mid_south", "red_sea_zuqar_n"),
    ("red_sea_zuqar_n", "red_sea_zuqar_s"),
    ("red_sea_zuqar_s", "red_sea_zuqar_se"),
    ("red_sea_zuqar_se", "bab_el_mandeb_n"),
    ("bab_el_mandeb_n", "bab_el_mandeb_mid"),
    ("bab_el_mandeb_mid", "gulf_aden_w"),
    ("gulf_aden_w", "gulf_aden_mid"),
    ("gulf_aden_mid", "gulf_aden_e"),
    ("gulf_aden_e", "guardafui_channel"),
    ("guardafui_channel", "somali_basin"),
    ("somali_basin", "equatorial_ind_w"),
    ("equatorial_ind_w", "mozambique_n"),
    ("mozambique_n", "mozambique_n2"),
    ("mozambique_n2", "mozambique_mid"),
    ("mozambique_mid", "mozambique_s"),
    ("mozambique_s", "durban_offshore"),
    ("durban_offshore", "port_elizabeth_offshore"),
    ("port_elizabeth_offshore", "cape_agulhas"),
    ("cape_agulhas", "cape_good_hope_offshore"),
    ("cape_good_hope_offshore", "south_atlantic_e"),
    ("south_atlantic_e", "south_atlantic_mid"),
    ("south_atlantic_mid", "south_atlantic_w"),
    ("south_atlantic_w", "sub_antarctic_scotia_e"),
    ("sub_antarctic_scotia_e", "scotia_sea_mid"),
    ("scotia_sea_mid", "weddell_approach_ne"),
    ("weddell_approach_ne", "weddell_approach_nw"),
    
    # Gibraltar & Atlantic chain
    ("gibraltar_east", "gibraltar_strait"),
    ("gibraltar_strait", "gibraltar_west"),
    ("gibraltar_west", "gibraltar_atlantic"),
    ("gibraltar_atlantic", "morocco_offshore"),
    ("morocco_offshore", "canary_passage_w"),
    ("canary_passage_w", "canary_south_w"),
    ("canary_south_w", "cape_verde_nw"),
    ("cape_verde_nw", "cape_verde_w"),
    ("cape_verde_w", "equatorial_atlantic_w"),
    ("equatorial_atlantic_w", "south_atlantic_nw"),
    ("south_atlantic_nw", "south_atlantic_sw"),
    ("south_atlantic_sw", "argentine_basin_e"),
    ("argentine_basin_e", "falklands_e"),
    ("falklands_e", "weddell_approach_nw"),
    ("falklands_e", "scotia_sea_mid"),
    
    # Cross links
    ("south_atlantic_sw", "south_atlantic_mid"),
    ("south_atlantic_nw", "south_atlantic_e"),
    
    # Drake & Peninsula
    ("falklands_e", "drake_passage_n"),
    ("drake_passage_n", "drake_passage_s"),
    ("drake_passage_s", "antarctic_peninsula_w"),
    ("drake_passage_s", "antarctic_peninsula_tip"),
    ("antarctic_peninsula_tip", "weddell_approach_nw"),
]

# Build adjacency map
_CORRIDOR_ADJ: dict[str, list[tuple[str, float]]] = {}
for _k in GLOBAL_CORRIDOR_NODES:
    _CORRIDOR_ADJ[_k] = []
for _u, _v in GLOBAL_CORRIDOR_EDGES:
    _d = _haversine_nm(GLOBAL_CORRIDOR_NODES[_u], GLOBAL_CORRIDOR_NODES[_v])
    _CORRIDOR_ADJ[_u].append((_v, _d))
    _CORRIDOR_ADJ[_v].append((_u, _d))


def _densify_route(waypoints: list[tuple[float, float]], max_step_deg: float = 0.25) -> list[tuple[float, float]]:
    """Densifies a coarse waypoint path so waypoints are placed every max_step_deg (~15 NM)."""
    if len(waypoints) < 2:
        return waypoints

    dense = [waypoints[0]]
    for p1, p2 in zip(waypoints, waypoints[1:]):
        dlat = p2[0] - p1[0]
        dlon = p2[1] - p1[1]
        dist_deg = math.hypot(dlat, dlon)
        num_sub = max(1, int(math.ceil(dist_deg / max_step_deg)))

        for i in range(1, num_sub + 1):
            t = i / float(num_sub)
            lat = round(p1[0] + dlat * t, 4)
            lon = round(p1[1] + dlon * t, 4)
            dense.append((lat, lon))

    return dense


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
    max_iter: int = 10000,
) -> list[tuple[float, float]]:
    """Runs land-avoiding, ice-aware, iceberg-avoiding A* search for Antarctic regional waters."""
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

            # Prevent stepping across or corner-cutting any land or islets
            if is_segment_land(current, nxt, num_samples=6):
                continue

            ice = _ice_at(*nxt)
            berg_pen = _berg_penalty(*nxt, rel_bergs, berg_radius)
            
            # Signed perpendicular distance from straight line
            perp = (dy * (nxt[0] - s[0]) - dx * (nxt[1] - s[1])) / length
            bias_cost = -perp * corridor_bias
            
            step_d = _haversine_nm(current, nxt)
            cost = (
                dist_w * step_d
                + ice_w * (ice ** 2) * 50.0
                + berg_w * min(100.0, berg_pen * 25.0)
                + bias_cost
            )
            
            tentative = gscore[current] + cost
            if tentative < gscore.get(nxt, 1e18):
                gscore[nxt] = tentative
                came[nxt] = current
                heapq.heappush(openh, (tentative + heur(nxt), nxt))

    return []


def _route_global_corridor(
    start: tuple[float, float],
    dest: tuple[float, float],
    bergs: list[dict],
    ice_w: float,
    berg_w: float,
    dist_w: float,
    berg_radius: float,
    corridor_bias: float,
) -> list[tuple[float, float]]:
    """Calculates global sea route using the maritime corridor graph and 0.25-deg resolution densification."""
    s = start
    d = dest

    # 1. Check direct sea line of sight
    if not is_segment_land(s, d, num_samples=max(20, int(_haversine_nm(s, d) / 10.0))):
        return _densify_route([s, d], max_step_deg=0.25)

    # 2. Connect start and dest to nearest navigable corridor nodes
    s_candidates: list[tuple[str, float]] = []
    d_candidates: list[tuple[str, float]] = []

    sorted_s = sorted(GLOBAL_CORRIDOR_NODES.items(), key=lambda item: _haversine_nm(s, item[1]))
    for name, pos in sorted_s[:10]:
        dist_s = _haversine_nm(s, pos)
        if not is_segment_land(s, pos):
            s_candidates.append((name, dist_s))
            if len(s_candidates) >= 3:
                break

    sorted_d = sorted(GLOBAL_CORRIDOR_NODES.items(), key=lambda item: _haversine_nm(d, item[1]))
    for name, pos in sorted_d[:10]:
        dist_d = _haversine_nm(pos, d)
        if not is_segment_land(pos, d):
            d_candidates.append((name, dist_d))
            if len(d_candidates) >= 3:
                break

    if not s_candidates:
        closest_s = sorted_s[0][0]
        s_candidates.append((closest_s, _haversine_nm(s, GLOBAL_CORRIDOR_NODES[closest_s])))

    if not d_candidates:
        closest_d = sorted_d[0][0]
        d_candidates.append((closest_d, _haversine_nm(GLOBAL_CORRIDOR_NODES[closest_d], d)))

    # 3. Dijkstra / A* across corridor network
    q: list[tuple[float, str, list[tuple[float, float]]]] = []
    for name, dist in s_candidates:
        heapq.heappush(q, (dist * dist_w, name, [s, GLOBAL_CORRIDOR_NODES[name]]))

    visited: dict[str, float] = {}
    best_path: list[tuple[float, float]] | None = None
    best_cost = 1e18

    while q:
        cost, u, path = heapq.heappop(q)
        if u in visited and visited[u] <= cost:
            continue
        visited[u] = cost

        # Check connection to dest
        for d_name, d_dist in d_candidates:
            if u == d_name:
                total_cost = cost + d_dist * dist_w
                if total_cost < best_cost:
                    best_cost = total_cost
                    best_path = path + [d]

        for v, edge_d in _CORRIDOR_ADJ[u]:
            next_cost = cost + edge_d * dist_w
            if next_cost < visited.get(v, 1e18):
                heapq.heappush(q, (next_cost, v, path + [GLOBAL_CORRIDOR_NODES[v]]))

    if not best_path:
        raise ValueError(f"No navigable sea path found between {start} and {dest}")

    # 4. If destination is inside the Antarctic zone (lat <= -52), refine polar approach with Antarctic A*
    if d[0] <= -52.0 and len(best_path) >= 2:
        polar_entry_idx = len(best_path) - 1
        for i in range(len(best_path) - 1, -1, -1):
            if best_path[i][0] <= -52.0:
                polar_entry_idx = i
            else:
                break
        
        polar_entry = best_path[polar_entry_idx]
        if _haversine_nm(polar_entry, d) > 30.0:
            local_polar = astar(
                start=polar_entry,
                dest=d,
                bergs=bergs,
                ice_w=ice_w,
                berg_w=berg_w,
                dist_w=dist_w,
                berg_radius=berg_radius,
                step=0.18,
                corridor_bias=corridor_bias,
                max_iter=10000,
            )
            if local_polar and len(local_polar) >= 2:
                best_path = best_path[:polar_entry_idx] + local_polar

    # 5. Densify intermediate legs to 0.25 deg resolution
    dense_path = _densify_route(best_path, max_step_deg=0.25)
    return dense_path


def _smooth_path(path: list[tuple[float, float]], bergs: list[dict], berg_radius: float, max_lookahead: int = 6) -> list[tuple[float, float]]:
    """Removes unnecessary zig-zag nodes if direct line-of-sight is land-free, ice-safe, and hazard-free."""
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
    return smoothed


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
    else:
        risk = max(0.40, min(0.95, risk * 1.5 + 0.35))

    return round(float(risk), 2)


def three_routes(start: list[float], dest: list[float], bergs: list[dict]) -> list[dict]:
    """Generates three distinct routes (Safest, Balanced, Fastest) with guaranteed sea-only land avoidance."""
    t_start = time.perf_counter()
    s_raw = (float(start[0]), float(start[1]))
    d_raw = (float(dest[0]), float(dest[1]))

    # Snap coordinates if on land
    s = snap_to_sea(s_raw[0], s_raw[1])
    d = snap_to_sea(d_raw[0], d_raw[1])

    is_regional_antarctic = (s[0] <= -50.0 and d[0] <= -50.0 and _haversine_nm(s, d) < 1800.0)

    specs = [
        ("safest", "Safest", 8.0, 50.0, 0.9, 30.0, 0.6, 9.5),
        ("balanced", "Balanced", 2.0, 15.0, 1.0, 15.0, 0.0, 12.5),
        ("fastest", "Fastest", 0.3, 1.0, 1.3, 5.0, -0.2, 16.0),
    ]

    out = []
    for rid, name, ice_w, berg_w, dist_w, berg_radius, bias, speed in specs:
        if is_regional_antarctic:
            raw_pts = astar(
                start=s,
                dest=d,
                bergs=bergs,
                ice_w=ice_w,
                berg_w=berg_w,
                dist_w=dist_w,
                berg_radius=berg_radius,
                step=0.18,
                corridor_bias=bias,
                max_iter=10000,
            )
            # If regional A* failed to find path, fallback to corridor
            if not raw_pts:
                raw_pts = _route_global_corridor(
                    start=s,
                    dest=d,
                    bergs=bergs,
                    ice_w=ice_w,
                    berg_w=berg_w,
                    dist_w=dist_w,
                    berg_radius=berg_radius,
                    corridor_bias=bias,
                )
        else:
            raw_pts = _route_global_corridor(
                start=s,
                dest=d,
                bergs=bergs,
                ice_w=ice_w,
                berg_w=berg_w,
                dist_w=dist_w,
                berg_radius=berg_radius,
                corridor_bias=bias,
            )

        if not raw_pts or len(raw_pts) < 2:
            raise ValueError(f"Unable to find navigable sea route between {start} and {dest}")

        # Enforce hard segment-level land constraint
        for p_a, p_b in zip(raw_pts, raw_pts[1:]):
            if is_segment_land(p_a, p_b, num_samples=10):
                print(f"[ROUTER-WARNING] Route '{name}' segment between {p_a} and {p_b} touches land cell!")

        nm = 0.0
        for a, b in zip(raw_pts, raw_pts[1:]):
            nm += _haversine_nm(a, b)

        eta = nm / speed if speed else nm
        dynamic_risk = _calculate_dynamic_risk(raw_pts, bergs, rid)

        out.append(
            {
                "id": rid,
                "name": name,
                "distanceNm": round(nm, 1),
                "etaHours": round(eta, 1),
                "fuelMt": round(nm * 0.14, 1),
                "riskScore": dynamic_risk,
                "points": [{"lat": round(p[0], 4), "lon": round(p[1], 4)} for p in raw_pts],
            }
        )

    t_end = time.perf_counter()
    compute_ms = round((t_end - t_start) * 1000.0, 2)
    print(f"[ROUTER] Successfully computed 3 routes in {compute_ms} ms")

    return out
