import time
from fastapi import APIRouter, HTTPException

from db.models import list_icebergs
from ml.lstm_predictor import predict

router = APIRouter()

_CACHE_TIME = 0.0
_CACHED_RESULT = None
_CACHE_TTL = 300.0  # 5 minutes in-memory cache for sub-millisecond responses


def invalidate_iceberg_cache():
    global _CACHED_RESULT, _CACHE_TIME
    _CACHED_RESULT = None
    _CACHE_TIME = 0.0


def _enrich(row: dict) -> dict:
    traj = predict(row["lat"], row["lon"], name=row["name"])
    diameter = 0.6 + (abs(hash(row["name"])) % 25) / 10
    high = diameter >= 1.8
    return {
        "id": f"IBG-{row['name']}",
        "name": row["name"],
        "lat": row["lat"],
        "lon": row["lon"],
        "diameterNm": round(diameter, 1),
        "sizeClass": "very_large" if diameter > 2.4 else "large" if diameter > 1.6 else "medium",
        "status": "tracked",
        "highRisk": high,
        "dangerRadiusNm": 10 if high else 7,
        "headingDeg": 90,
        "doy": row.get("doy"),
        "source": row.get("source"),
        "predictedPath": [
            {"lat": row["lat"], "lon": row["lon"], "hour": 0},
            *[{"lat": p["lat"], "lon": p["lon"], "hour": p["hour"]} for p in traj],
        ],
        "uncertainty": traj,
    }


def get_enriched_icebergs():
    global _CACHE_TIME, _CACHED_RESULT
    now = time.time()
    if _CACHED_RESULT is not None and (now - _CACHE_TIME) < _CACHE_TTL:
        return _CACHED_RESULT
    rows = list_icebergs()
    enriched = [_enrich(r) for r in rows]
    _CACHED_RESULT = {"count": len(rows), "icebergs": enriched}
    _CACHE_TIME = now
    return _CACHED_RESULT


@router.get("")
@router.get("/")
def list_all():
    return get_enriched_icebergs()


@router.get("/{iceberg_id}/trajectory")
def trajectory(iceberg_id: str):
    name = iceberg_id.replace("IBG-", "")
    rows = [r for r in list_icebergs() if r["name"].upper() == name.upper()]
    if not rows:
        raise HTTPException(404, "unknown iceberg")
    return _enrich(rows[0])
