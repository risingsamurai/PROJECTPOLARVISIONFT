"""Ocean Flow Field and Freshwater Dispersion API Router."""
from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Query

router = APIRouter()

BASE_PLUMES = [
    {
        "id": "plume-a76c",
        "sourceName": "A76C Tabular Discharge",
        "baseLat": -68.22,
        "baseLon": -51.85,
        "radiusNm": 8.5,
        "intensity": 0.88,
        "salinityAnomalyPsu": -1.38,
        "meltRateM3s": 1420.0,
        "temperatureAnomalyC": -0.85,
    },
    {
        "id": "plume-a81",
        "sourceName": "A81 Melt Front",
        "baseLat": -68.55,
        "baseLon": -52.05,
        "radiusNm": 7.2,
        "intensity": 0.65,
        "salinityAnomalyPsu": -1.15,
        "meltRateM3s": 890.0,
        "temperatureAnomalyC": -0.72,
    },
    {
        "id": "plume-a83",
        "sourceName": "A83 Grounding-Line Plume",
        "baseLat": -68.08,
        "baseLon": -52.70,
        "radiusNm": 9.8,
        "intensity": 0.94,
        "salinityAnomalyPsu": -1.72,
        "meltRateM3s": 1950.0,
        "temperatureAnomalyC": -0.92,
    },
    {
        "id": "plume-larsen-c",
        "sourceName": "Larsen-C Barrier Melt",
        "baseLat": -67.45,
        "baseLon": -60.50,
        "radiusNm": 12.0,
        "intensity": 0.82,
        "salinityAnomalyPsu": -1.55,
        "meltRateM3s": 2300.0,
        "temperatureAnomalyC": -0.80,
    },
]


@router.get("/dispersion-plume")
def get_dispersion_plume(day: int = Query(default=1, ge=1, le=7)):
    drift_lat = 0.08 * (day - 1)
    drift_lon = 0.12 * (day - 1)
    plumes = []
    for p in BASE_PLUMES:
        decay = 1.0 - (day - 1) * 0.07
        plumes.append({
            "id": f"{p['id']}-d{day}",
            "sourceName": p["sourceName"],
            "lat": round(p["baseLat"] + drift_lat, 3),
            "lon": round(p["baseLon"] + drift_lon, 3),
            "radiusNm": round(p["radiusNm"] * (1.0 + 0.12 * (day - 1)), 1),
            "intensity": round(max(0.2, p["intensity"] * decay), 2),
            "salinityAnomalyPsu": round(p["salinityAnomalyPsu"] * decay, 2),
            "meltRateM3s": round(p["meltRateM3s"] * decay, 1),
            "temperatureAnomalyC": round(p["temperatureAnomalyC"] * decay, 2),
        })

    vectors = []
    for lat_i in range(5):
        lat = -69.0 + lat_i * 0.6
        for lon_i in range(5):
            lon = -54.0 + lon_i * 0.8
            angle_rad = (25.0 + day * 3.0 + lat_i * 8.0) * math.pi / 180.0
            spd = 0.8 + 0.15 * day + 0.1 * math.sin(lat_i + lon_i)
            dlat = spd * 0.02 * math.cos(angle_rad)
            dlon = spd * 0.05 * math.sin(angle_rad)
            vectors.append({
                "id": f"vec-{day}-{lat_i}-{lon_i}",
                "start": [round(lon, 3), round(lat, 3)],
                "end": [round(lon + dlon, 3), round(lat + dlat, 3)],
                "speedKnots": round(spd, 2),
                "headingDeg": round(25.0 + day * 3.0 + lat_i * 8.0, 1),
            })

    return {
        "status": "LIVE",
        "day": day,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "plumes": plumes,
        "flowVectors": vectors,
    }


@router.get("/flow-field")
def get_flow_field(day: int = Query(default=1, ge=1, le=7)):
    cells = []
    lats = [-70.0 + i * 0.5 for i in range(13)]  # -70 to -64
    lons = [-56.0 + j * 0.8 for j in range(16)]  # -56 to -44

    for lat in lats:
        for lon in lons:
            weddell_gyre_v = 0.4 + 0.3 * math.sin((lat + 68) * 0.8)
            melt_factor = max(0.0, 1.0 - math.sqrt((lat + 68.2)**2 + (lon + 52.0)**2) / 3.0)
            u = round(weddell_gyre_v * 0.6 + 0.1 * math.cos(lon), 3)
            v = round(weddell_gyre_v * 0.8 + 0.05 * day, 3)
            spd = round(math.sqrt(u * u + v * v) * 1.94384, 2)  # m/s to knots
            salinity_psu = round(34.2 - melt_factor * 1.8 * (1.0 - (day - 1) * 0.05), 2)
            temp_c = round(-1.5 + (lat + 70) * 0.25 + melt_factor * -0.4, 2)

            cells.append({
                "lat": round(lat, 2),
                "lon": round(lon, 2),
                "u": u,
                "v": v,
                "speedKnots": spd,
                "salinityPsu": salinity_psu,
                "temperatureC": temp_c,
            })

    return {
        "status": "LIVE",
        "day": day,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "gridResolutionDeg": 0.5,
        "cells": cells,
    }
