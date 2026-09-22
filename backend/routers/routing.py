from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import signal
import sys

from db.models import list_icebergs
from ml.astar_router import three_routes

router = APIRouter()


class RouteRequest(BaseModel):
    start: list[float]
    destination: list[float]


def timeout_handler(signum, frame):
    raise TimeoutError("Route computation timed out")


@router.post("")
@router.post("/")
def compute_route(body: RouteRequest):
    try:
        bergs = list_icebergs()
        routes = three_routes(body.start, body.destination, bergs)
        return {"status": "ok", "routes": routes}
    except TimeoutError:
        raise HTTPException(status_code=504, detail="Route computation timed out")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Route computation failed: {str(e)}")
