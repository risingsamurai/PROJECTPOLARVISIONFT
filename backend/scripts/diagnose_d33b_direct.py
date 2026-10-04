import sys
from pathlib import Path
sys.path.append(str(Path(__file__).resolve().parent.parent))

from db.models import list_icebergs
from ml.astar_router import three_routes
import math

def haversine_nm(a, b):
    r = 3440.065
    dlat = math.radians(b[0] - a[0])
    dlon = math.radians(b[1] - a[1])
    la1, la2 = math.radians(a[0]), math.radians(b[0])
    h = math.sin(dlat / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin(dlon / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(h)))

def min_dist_to_route(pts, target):
    min_d = 1e9
    for i in range(len(pts) - 1):
        p1, p2 = pts[i], pts[i+1]
        for step in range(101):
            t = step / 100.0
            lat = p1[0] + (p2[0] - p1[0]) * t
            lon = p1[1] + (p2[1] - p1[1]) * t
            d = haversine_nm((lat, lon), target)
            if d < min_d:
                min_d = d
    return min_d

bergs = list_icebergs()
d33b = next((b for b in bergs if b['name'] == 'D33B'), None)
diameter = 0.6 + (abs(hash(d33b['name'])) % 25) / 10
phys_radius = diameter / 2.0
danger_radius = 7.0

print("=== D33B DETAILS ===")
print(f"Name: {d33b['name']}, Lat: {d33b['lat']}, Lon: {d33b['lon']}")
print(f"Diameter: {diameter:.1f} NM, Physical Radius: {phys_radius:.2f} NM, Danger Radius: {danger_radius:.1f} NM")

test_cases = [
    ("Direct Route Crossing D33B", [-57.0, -43.2167], [-60.5, -43.2167]),
    ("Target Route to D33B from Vessel [-64.5, -48.0]", [-64.5, -48.0], [d33b['lat'], d33b['lon']]),
    ("Route Near A85 (Test A)", [-62.5, -53.95], [-65.0, -53.95]),
]

for label, s, d in test_cases:
    routes = three_routes(s, d, bergs)
    print(f"\n--- {label} ---")
    print(f"Start: {s} -> Dest: {d}")
    target_berg = d33b if "D33B" in label else next((b for b in bergs if b['name'] == 'A85'), d33b)
    t_name = target_berg['name']
    t_pos = (target_berg['lat'], target_berg['lon'])
    t_diam = 0.6 + (abs(hash(target_berg['name'])) % 25) / 10
    t_phys = t_diam / 2.0
    t_dang = 10.0 if t_diam >= 1.8 else 7.0
    
    for r in routes:
        pts = [(p['lat'], p['lon']) for p in r['points']]
        dist = min_dist_to_route(pts, t_pos)
        enters_phys = dist < t_phys
        enters_danger = dist < t_dang
        status = "ENTERS PHYSICAL BODY" if enters_phys else ("INSIDE DANGER RADIUS" if enters_danger else "CLEAR")
        print(f"  {r['name']:8s}: Dist={r['distanceNm']:5.1f} NM | Min Dist to {t_name}={dist:5.2f} NM (Phys: {t_phys:.2f}, Dang: {t_dang:.1f}) | Status={status}")
