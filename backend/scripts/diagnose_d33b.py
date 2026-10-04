import urllib.request
import json
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

# Fetch icebergs
res_ib = urllib.request.urlopen('http://127.0.0.1:8000/api/icebergs')
data_ib = json.loads(res_ib.read().decode('utf-8'))
d33b = next((b for b in data_ib['icebergs'] if b['name'] == 'D33B'), None)
print(f"D33B Info: lat={d33b['lat']}, lon={d33b['lon']}, diameterNm={d33b['diameterNm']}, dangerRadiusNm={d33b['dangerRadiusNm']}")
phys_radius = d33b['diameterNm'] / 2.0
danger_radius = d33b['dangerRadiusNm']
print(f"D33B Physical Radius: {phys_radius:.2f} NM, Danger Radius: {danger_radius:.2f} NM")

pairs = [
    ("User Screenshot / Pair 3", [-60.1253, -55.15], [-64.58, -43.1]),
    ("Main Verified Pair", [-68.35, -52.45], [-64.58, -43.1]),
]

for label, s, d in pairs:
    req = urllib.request.Request(
        'http://127.0.0.1:8000/api/route',
        data=json.dumps({'start': s, 'destination': d}).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    routes = json.loads(urllib.request.urlopen(req).read().decode('utf-8'))['routes']
    print(f"\n--- {label}: {s} -> {d} ---")
    for r in routes:
        pts = [(p['lat'], p['lon']) for p in r['points']]
        dist = min_dist_to_route(pts, (d33b['lat'], d33b['lon']))
        enters_phys = dist < phys_radius
        enters_danger = dist < danger_radius
        status = "ENTERS PHYSICAL BODY" if enters_phys else ("INSIDE DANGER RADIUS" if enters_danger else "CLEAR")
        print(f"  {r['name']:8s}: Min Dist = {dist:6.2f} NM | Status = {status}")

