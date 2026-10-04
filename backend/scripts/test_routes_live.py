import urllib.request
import json

def test_route(name, start, dest):
    data = json.dumps({'start': start, 'destination': dest}).encode('utf-8')
    req = urllib.request.Request('http://127.0.0.1:8000/api/route', data=data, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as resp:
            res = json.loads(resp.read().decode('utf-8'))
            print(f"=== {name}: {start} -> {dest} ===")
            for r in res.get('routes', []):
                print(f"  id: {r['id']:<10} name: {r['name']:<10} distanceNm: {r['distanceNm']:<8.1f} etaHours: {r['etaHours']:<8.1f} fuelMt: {r['fuelMt']:<8.1f} riskScore: {r['riskScore']:<6.2f}")
    except Exception as e:
        print(f"Error testing {name}: {e}")

if __name__ == "__main__":
    test_route("Main Pair", [-68.35, -52.45], [-64.58, -43.1])
    test_route("Short Pair", [-68.35, -52.45], [-68.72, -49.55])
    test_route("Land Test (Peninsula avoidance)", [-64.0, -66.0], [-64.0, -56.0])
    test_route("Test A", [-62.5, -53.95], [-65.0, -53.95])
