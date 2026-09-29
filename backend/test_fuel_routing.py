import sys
sys.path.insert(0, '.')
from db.models import list_icebergs, init_db
init_db()
bergs = list_icebergs()
print(f'Loaded {len(bergs)} icebergs')
from ml.astar_router import three_routes
import time

print('--- Short Antarctic route ---')
t0 = time.perf_counter()
routes = three_routes([-68.35, -52.45], [-68.72, -49.55], bergs)
t1 = time.perf_counter()
print(f'Compute: {(t1-t0)*1000:.0f}ms')
print(f"{'Profile':12} {'Dist':>8} {'ETA':>8} {'Fuel':>8} {'Risk':>6} {'Speed':>6}")
fuels = []
etas = []
for r in routes:
    print(f"{r['name']:12} {r['distanceNm']:>8.1f} {r['etaHours']:>8.1f} {r['fuelMt']:>8.1f} {r['riskScore']:>6.2f} {r.get('avgSpeedKts','?'):>6}")
    if r.get('fuelBreakdown'):
        fb = r['fuelBreakdown']
        print(f"  breakdown: base={fb['baseMt']:.1f} ice={fb['iceAddedMt']:.1f} weather={fb['weatherAddedMt']:.1f}")
    fuels.append(r['fuelMt'])
    etas.append(r['etaHours'])
print(f'Unique fuel values: {sorted(set(fuels))}')
print(f'Unique ETA values:  {sorted(set(etas))}')
print(f'Fuel distinct: {len(set(fuels)) > 1}')
print(f'ETA distinct:  {len(set(etas)) > 1}')
