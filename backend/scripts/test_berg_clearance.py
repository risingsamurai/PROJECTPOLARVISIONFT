import sys
from pathlib import Path
sys.path.append(str(Path(__file__).resolve().parent.parent))

from db.models import list_icebergs
from ml.astar_router import three_routes, _haversine_nm, _berg_hard_radius
import math

def min_dist_segment_to_point(p1, p2, target, num_samples=100):
    min_d = 1e9
    for i in range(num_samples + 1):
        t = i / float(num_samples)
        lat = p1[0] + (p2[0] - p1[0]) * t
        lon = p1[1] + (p2[1] - p1[1]) * t
        d = _haversine_nm((lat, lon), target)
        if d < min_d:
            min_d = d
    return min_d

def min_dist_route_to_point(pts, target):
    min_d = 1e9
    for i in range(len(pts) - 1):
        d = min_dist_segment_to_point(pts[i], pts[i+1], target)
        if d < min_d:
            min_d = d
    return min_d

def calculate_standoff_dest(start, target_berg):
    """Calculates standoff destination point on the approach side at danger radius."""
    b_lat, b_lon = target_berg["lat"], target_berg["lon"]
    s_lat, s_lon = start[0], start[1]
    total_d = _haversine_nm((s_lat, s_lon), (b_lat, b_lon))
    danger_r = target_berg.get("dangerRadiusNm", 7.0)
    standoff_d = danger_r + 0.5  # 7.5 NM standoff
    t = max(0.0, (total_d - standoff_d) / max(0.001, total_d))
    dest_lat = s_lat + (b_lat - s_lat) * t
    dest_lon = s_lon + (b_lon - s_lon) * t
    return [round(dest_lat, 4), round(dest_lon, 4)]

def main():
    bergs = list_icebergs()
    d33b = next((b for b in bergs if b['name'] == 'D33B'), None)
    a85 = next((b for b in bergs if b['name'] == 'A85'), None)

    # 6 test pairs:
    # 1. Main Pair: [-68.35, -52.45] -> [-64.58, -43.1]
    # 2. Short Pair: [-68.35, -52.45] -> [-68.72, -49.55]
    # 3. Pair 3 (Off-axis user pair): [-60.1253, -55.15] -> [-64.58, -43.1]
    # 4. Test A (Through/near A85): [-62.5, -53.95] -> [-65.0, -53.95]
    # 5. Direct Route Through D33B: [-57.0, -43.2167] -> [-60.5, -43.2167]
    # 6. Target Route to D33B with safe standoff approach point:
    vessel_start = [-64.5, -48.0]
    standoff_d33b = calculate_standoff_dest(vessel_start, d33b)

    pairs = [
        ("1. Main Pair", [-68.35, -52.45], [-64.58, -43.1], None),
        ("2. Short Pair", [-68.35, -52.45], [-68.72, -49.55], None),
        ("3. Pair 3", [-60.1253, -55.15], [-64.58, -43.1], None),
        ("4. Test A (Near A85)", [-62.5, -53.95], [-65.0, -53.95], a85),
        ("5. Direct Through D33B", [-57.0, -43.2167], [-60.5, -43.2167], d33b),
        ("6. Target Route to D33B (Standoff)", vessel_start, standoff_d33b, d33b),
    ]

    all_passed = True

    print("=" * 90)
    print("=== ICEBERG CLEARANCE & HARD OBSTACLE VERIFICATION TEST (6 PAIRS) ===")
    print("=" * 90)

    for title, s, d, focus_berg in pairs:
        routes = three_routes(s, d, bergs)
        print(f"\n--- {title} | Start: {s} -> Dest: {d} ---")
        if focus_berg:
            f_name = focus_berg["name"]
            f_pos = (focus_berg["lat"], focus_berg["lon"])
            f_hard_r = _berg_hard_radius(focus_berg)
            f_phys_r = (focus_berg.get("diameterNm") or 1.5) / 2.0
            print(f"  Target Focus Berg: {f_name} at {f_pos} | Phys Radius: {f_phys_r:.2f} NM | Hard Min Clearance Radius: {f_hard_r:.2f} NM")

        for r in routes:
            pts = [(p["lat"], p["lon"]) for p in r["points"]]
            
            # Check clearance across ALL 38 bergs in the database
            min_clearance_margin = 1e9
            closest_berg_name = ""
            closest_berg_dist = 1e9
            closest_berg_hard_r = 0.0

            for b in bergs:
                b_pos = (b["lat"], b["lon"])
                hard_r = _berg_hard_radius(b)
                dist = min_dist_route_to_point(pts, b_pos)
                margin = dist - hard_r
                if margin < min_clearance_margin:
                    min_clearance_margin = margin
                    closest_berg_name = b["name"]
                    closest_berg_dist = dist
                    closest_berg_hard_r = hard_r

            passed = min_clearance_margin >= -0.05  # allow small float precision
            if not passed:
                all_passed = False

            status_str = "PASS" if passed else "FAIL"
            print(
                f"  [{status_str}] {r['name']:8s}: Dist={r['distanceNm']:5.1f} NM | "
                f"Closest Berg: {closest_berg_name:5s} (Dist: {closest_berg_dist:5.2f} NM, Req Min: {closest_berg_hard_r:4.2f} NM, Margin: {min_clearance_margin:+5.2f} NM) | "
                f"Max SIC: {r.get('maxSicPct', 0)}% | Mean SIC: {r.get('meanSicPct', 0)}%"
            )

    print("\n" + "=" * 90)
    print(f"FINAL CLEARANCE STATUS: {'ALL INVARIANTS PASSED (100%)' if all_passed else 'SOME TESTS FAILED'}")
    print("=" * 90)

if __name__ == "__main__":
    main()
