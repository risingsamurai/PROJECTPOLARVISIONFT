"""Wildlife and Eco-monitoring API Router."""
from __future__ import annotations

from fastapi import APIRouter

router = APIRouter()

COLONIES = [
    {
        "id": "col-emperor-snow-hill",
        "name": "Snow Hill Island Colony",
        "species": "Emperor Penguin (Aptenodytes forsteri)",
        "icon": "penguin",
        "colonyType": "Breeding Rookery / Fast-Ice",
        "population": "~4,200 breeding pairs",
        "populationNum": 8400,
        "lat": -64.48,
        "lon": -57.22,
        "riskTier": "High",
        "reason": "Tabular iceberg drift corridor within 14 NM; early fast-ice breakup hazard.",
        "sparkline": [4100, 4150, 4200, 4180, 4250, 4210, 4200],
    },
    {
        "id": "col-adelie-paulet",
        "name": "Paulet Island Rookery",
        "species": "Adélie Penguin (Pygoscelis adeliae)",
        "icon": "penguin",
        "colonyType": "Nesting & Foraging Colony",
        "population": "~105,000 pairs",
        "populationNum": 210000,
        "lat": -63.58,
        "lon": -55.78,
        "riskTier": "Critical",
        "reason": "Direct overlap with Antarctic Sound shipping corridor & A-85 trajectory.",
        "sparkline": [98000, 102000, 104000, 105000, 106000, 105500, 105000],
    },
    {
        "id": "col-weddell-erebus",
        "name": "Erebus Bay Seal Preserve",
        "species": "Weddell Seal (Leptonychotes weddellii)",
        "icon": "seal",
        "colonyType": "Pupping & Molting Haulout",
        "population": "~1,750 adults & pups",
        "populationNum": 1750,
        "lat": -65.20,
        "lon": -64.10,
        "riskTier": "Moderate",
        "reason": "Stable coastal fast-ice; moderate wake-wash sensitivity.",
        "sparkline": [1600, 1650, 1720, 1750, 1780, 1760, 1750],
    },
    {
        "id": "col-snow-petrel-hope",
        "name": "Hope Bay Cliff Sanctuary",
        "species": "Snow Petrel (Pagodroma nivea)",
        "icon": "petrel",
        "colonyType": "Cliff Nesting & Pelagic Forage",
        "population": "~3,400 breeding pairs",
        "populationNum": 6800,
        "lat": -63.38,
        "lon": -56.98,
        "riskTier": "Low",
        "reason": "Cliff roosting; vessel clearance > 5 NM maintained.",
        "sparkline": [3300, 3350, 3400, 3400, 3420, 3410, 3400],
    },
]


@router.get("/colonies")
def get_colonies():
    return {
        "status": "LIVE",
        "count": len(COLONIES),
        "colonies": COLONIES,
    }
