import sys
import time
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from data.land_mask import is_land, is_segment_land, snap_to_sea
from ml.astar_router import three_routes
from db.models import list_icebergs

def run_tests():
    bergs = list_icebergs()
    print(f"Loaded {len(bergs)} icebergs from database\n")

    print("=" * 80)
    print("TEST a: Suez (29.9, 32.6) -> Antarctica (-65.0, -53.95)")
    print("=" * 80)
    t0 = time.perf_counter()
    routes_suez = three_routes([29.9, 32.6], [-65.0, -53.95], bergs)
    t1 = time.perf_counter()
    print(f"Compute time: {(t1 - t0) * 1000.0:.2f} ms")
    for r in routes_suez:
        pts = r["points"]
        land_pts = [p for p in pts if is_land(p["lat"], p["lon"])]
        seg_crossings = [
            (p1, p2) for p1, p2 in zip(pts, pts[1:])
            if is_segment_land((p1["lat"], p1["lon"]), (p2["lat"], p2["lon"]), num_samples=15)
        ]
        print(f"{r['name']}: {r['distanceNm']} NM | ETA: {r['etaHours']}h | Fuel: {r['fuelMt']} MT | Risk: {r['riskScore']} | Points: {len(pts)} | Land Pts: {len(land_pts)} | Bad Segs: {len(seg_crossings)}")
        assert len(land_pts) == 0, f"Found land points in {r['name']}: {land_pts}"
        assert len(seg_crossings) == 0, f"Found land crossing segments in {r['name']}: {seg_crossings}"

    print("\n" + "=" * 80)
    print("TEST b: Gibraltar (35.0, -5.5) -> Antarctica (-65.0, -53.95)")
    print("=" * 80)
    t0 = time.perf_counter()
    routes_gib = three_routes([35.0, -5.5], [-65.0, -53.95], bergs)
    t1 = time.perf_counter()
    print(f"Compute time: {(t1 - t0) * 1000.0:.2f} ms")
    for r in routes_gib:
        pts = r["points"]
        land_pts = [p for p in pts if is_land(p["lat"], p["lon"])]
        seg_crossings = [
            (p1, p2) for p1, p2 in zip(pts, pts[1:])
            if is_segment_land((p1["lat"], p1["lon"]), (p2["lat"], p2["lon"]), num_samples=15)
        ]
        print(f"{r['name']}: {r['distanceNm']} NM | ETA: {r['etaHours']}h | Fuel: {r['fuelMt']} MT | Risk: {r['riskScore']} | Points: {len(pts)} | Land Pts: {len(land_pts)} | Bad Segs: {len(seg_crossings)}")
        assert len(land_pts) == 0, f"Found land points in {r['name']}: {land_pts}"
        assert len(seg_crossings) == 0, f"Found land crossing segments in {r['name']}: {seg_crossings}"

    print("\n" + "=" * 80)
    print("TEST c: REGRESSION TESTS")
    print("=" * 80)
    print("Scenario 1: -68.35,-52.45 to -64.58,-43.10 (Target: ~522.6 / 422.1 / 381.4 NM)")
    routes_reg1 = three_routes([-68.35, -52.45], [-64.58, -43.10], bergs)
    for r in routes_reg1:
        print(f"{r['name']}: {r['distanceNm']} NM | ETA: {r['etaHours']}h | Risk: {r['riskScore']}")

    print("\nScenario 2: Short trip -68.35,-52.45 to -68.72,-49.55 (Target: ~135 / 98 / 72 NM)")
    routes_reg2 = three_routes([-68.35, -52.45], [-68.72, -49.55], bergs)
    for r in routes_reg2:
        print(f"{r['name']}: {r['distanceNm']} NM | ETA: {r['etaHours']}h | Risk: {r['riskScore']}")

    print("\n" + "=" * 80)
    print("TEST d: Land Test -64.0,-66.0 to -64.0,-56.0 (Must avoid Peninsula)")
    print("=" * 80)
    routes_pen = three_routes([-64.0, -66.0], [-64.0, -56.0], bergs)
    for r in routes_pen:
        pts = r["points"]
        land_pts = [p for p in pts if is_land(p["lat"], p["lon"])]
        seg_crossings = [
            (p1, p2) for p1, p2 in zip(pts, pts[1:])
            if is_segment_land((p1["lat"], p1["lon"]), (p2["lat"], p2["lon"]), num_samples=15)
        ]
        print(f"{r['name']}: {r['distanceNm']} NM | Points: {len(pts)} | Land Pts: {len(land_pts)} | Bad Segs: {len(seg_crossings)}")
        assert len(land_pts) == 0
        assert len(seg_crossings) == 0

    print("\n" + "=" * 80)
    print("ALL TESTS PASSED SUCCESSFULLY!")
    print("=" * 80)

if __name__ == "__main__":
    run_tests()
