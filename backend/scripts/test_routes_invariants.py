import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import math
from ml.astar_router import _haversine_nm, _ice_at, _berg_penalty, _smooth_path, _calculate_dynamic_risk
from data.land_mask import is_land, is_segment_land
from db.models import list_icebergs
import heapq

bergs = list_icebergs()

def run_test():
    # 6 pairs
    pairs = [
        ('Main Pair', [-68.35, -52.45], [-64.58, -43.1]),
        ('Short Pair', [-68.35, -52.45], [-68.72, -49.55]),
        ('Pair 3 (User test)', [-60.1253, -55.15], [-64.58, -43.1]),
        ('Land Test', [-64.0, -66.0], [-64.0, -56.0]),
        ('Test A', [-62.5, -53.95], [-65.0, -53.95]),
        ('Test B', [-60.0, -47.33], [-55.0, -47.33]),
    ]
    
    # Specs: (id, name, ice_w, berg_w, dist_w, berg_radius, speed, fuel_rate)
    specs = [
        ('safest',   'Safest',   8.0, 50.0, 0.9, 30.0,  9.5, 0.14),
        ('balanced', 'Balanced', 2.0, 15.0, 1.0, 15.0, 12.5, 0.14),
        ('eco',      'Eco',      1.2,  8.0, 1.1, 10.0, 10.0, 0.11),
        ('fastest',  'Fastest',  0.1,  0.5, 1.6,  4.0, 16.0, 0.14),
    ]

    for name, start, dest in pairs:
        s = (float(start[0]), float(start[1]))
        d = (float(dest[0]), float(dest[1]))
        gc_dist = _haversine_nm(s, d)
        print(f"\n==========================================")
        print(f"=== {name}: {start} -> {dest} (Great Circle: {gc_dist:.1f} NM) ===")
        print(f"==========================================")

        routes = {}
        for rid, rname, ice_w, berg_w, dist_w, berg_radius, speed, fuel_rate in specs:
            step = 0.18
            step_nm = step * 60.0
            min_lat = min(s[0], d[0]) - 8.0
            max_lat = max(s[0], d[0]) + 8.0
            min_lon = min(s[1], d[1]) - 12.0
            max_lon = max(s[1], d[1]) + 12.0

            rel_bergs = [b for b in bergs if min_lat <= b["lat"] <= max_lat and min_lon <= b["lon"] <= max_lon]

            def heur(n):
                return _haversine_nm(n, d) * dist_w

            openh = [(heur(s), s)]
            came = {s: None}
            gscore = {s: 0.0}
            visited = set()
            dirs = [(step, 0), (-step, 0), (0, step), (0, -step), (step, step), (step, -step), (-step, step), (-step, -step)]

            found_path = None
            for _ in range(15000):
                if not openh:
                    break
                _, current = heapq.heappop(openh)
                if current in visited:
                    continue
                visited.add(current)

                if _haversine_nm(current, d) < step_nm * 1.5:
                    if not is_segment_land(current, d):
                        path = [d]
                        curr = current
                        while curr is not None:
                            path.append(curr)
                            curr = came[curr]
                        path.reverse()
                        found_path = _smooth_path(path, rel_bergs, berg_radius)
                        break

                for dlat, dlon in dirs:
                    nxt = (round(current[0] + dlat, 3), round(current[1] + dlon, 3))
                    if nxt in visited or is_land(nxt[0], nxt[1]):
                        continue
                    if is_segment_land(current, nxt, num_samples=6):
                        continue

                    ice = _ice_at(*nxt)
                    berg_pen = _berg_penalty(*nxt, rel_bergs, berg_radius)
                    step_d = _haversine_nm(current, nxt)
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

            raw_pts = found_path if found_path else [s, d]
            nm = 0.0
            for p1, p2 in zip(raw_pts, raw_pts[1:]):
                nm += _haversine_nm(p1, p2)

            eta = nm / speed if speed else nm
            fuel = nm * fuel_rate
            risk = _calculate_dynamic_risk(raw_pts, bergs, rid)
            routes[rid] = {
                'id': rid,
                'name': rname,
                'distanceNm': round(nm, 1),
                'etaHours': round(eta, 1),
                'fuelMt': round(fuel, 1),
                'riskScore': risk,
                'pts_count': len(raw_pts),
                'points': raw_pts
            }
            print(f"  {rname:<10}: Dist={nm:6.1f} NM | ETA={eta:5.1f} h | Fuel={fuel:5.1f} MT | Risk={risk:.2f} | Waypoints={len(raw_pts)}")

        # Check invariants
        fastest = routes['fastest']
        safest = routes['safest']
        eco = routes['eco']
        balanced = routes['balanced']

        min_dist = min(r['distanceNm'] for r in routes.values())
        inv1_fastest_dist = fastest['distanceNm'] <= min_dist * 1.01
        inv1_fastest_eta = fastest['etaHours'] <= min(r['etaHours'] for r in routes.values()) + 0.1
        inv2_safest_risk = safest['riskScore'] <= min(r['riskScore'] for r in routes.values())
        inv2_safest_dist = safest['distanceNm'] >= fastest['distanceNm'] - 0.5
        inv3_eco_fuel = eco['fuelMt'] <= min(r['fuelMt'] for r in routes.values()) + 0.1
        inv4_balanced = (fastest['etaHours'] <= balanced['etaHours'] <= safest['etaHours']) or (math.isclose(balanced['etaHours'], fastest['etaHours'], rel_tol=0.1))

        print(f"  --> Invariants:")
        print(f"      Fastest shortest/quickest: {inv1_fastest_dist and inv1_fastest_eta} (dist={fastest['distanceNm']}, min={min_dist}, eta={fastest['etaHours']})")
        print(f"      Safest lowest risk:        {inv2_safest_risk} (risk={safest['riskScore']}, dist={safest['distanceNm']})")
        print(f"      Eco lowest fuel:           {inv3_eco_fuel} (fuel={eco['fuelMt']}, balanced_fuel={balanced['fuelMt']})")
        print(f"      Balanced between:          {inv4_balanced}")

if __name__ == '__main__':
    run_test()
