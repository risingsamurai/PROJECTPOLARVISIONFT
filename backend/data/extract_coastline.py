import json
import math
from pathlib import Path
import shapefile

ROOT = Path(__file__).resolve().parent.parent.parent
SHP_PATH = ROOT / "backend" / "data" / "cache" / "ne_10m_land" / "ne_10m_land.shp"
OUT_JSON = ROOT / "frontend" / "public" / "data" / "antarctic_coastline.json"

ORIGIN_LAT = -68.4
ORIGIN_LON = -52.1
NM_PER_DEG_LAT = 60.0

def lat_lon_to_scene(lat: float, lon: float) -> tuple[float, float]:
    """Exact same coordinate conversion as frontend/lib/geo.ts latLonToScene."""
    x = (lon - ORIGIN_LON) * NM_PER_DEG_LAT * math.cos(math.radians(ORIGIN_LAT))
    z = -(lat - ORIGIN_LAT) * NM_PER_DEG_LAT
    return (round(x, 2), round(z, 2))

def simplify_points(pts: list[tuple[float, float]], tolerance: float = 1.0) -> list[tuple[float, float]]:
    """Simple Douglas-Peucker or radial decimation to keep polygon lightweight."""
    if len(pts) <= 3:
        return pts
    out = [pts[0]]
    for p in pts[1:-1]:
        dx = p[0] - out[-1][0]
        dz = p[1] - out[-1][1]
        if math.hypot(dx, dz) >= tolerance:
            out.append(p)
    out.append(pts[-1])
    return out

def main():
    print(f"Reading shapefile with pyshp: {SHP_PATH}")
    sf = shapefile.Reader(str(SHP_PATH))
    
    # Target domain around Weddell Sea / Antarctic Peninsula:
    # Lat -85 to -60, Lon -80 to -20
    MIN_LON, MAX_LON = -80.0, -20.0
    MIN_LAT, MAX_LAT = -85.0, -60.0
    
    out_polygons = []
    total_shapes = len(sf.shapes())
    print(f"Total shapes in file: {total_shapes}")

    for idx, shape in enumerate(sf.shapes()):
        bbox = shape.bbox # [minX, minY, maxX, maxY] (lon, lat)
        if bbox[2] < MIN_LON or bbox[0] > MAX_LON or bbox[3] < MIN_LAT or bbox[1] > MAX_LAT:
            continue
            
        # Shape has parts
        parts = list(shape.parts) + [len(shape.points)]
        for i in range(len(shape.parts)):
            part_pts = shape.points[parts[i]:parts[i+1]]
            
            # Check if part has points inside our bounding box
            scene_pts = []
            has_inside = False
            for lon, lat in part_pts:
                if MIN_LON - 5 <= lon <= MAX_LON + 5 and MIN_LAT - 5 <= lat <= MAX_LAT + 5:
                    has_inside = True
                scene_pts.append(lat_lon_to_scene(lat, lon))
                
            if has_inside and len(scene_pts) > 4:
                simplified = simplify_points(scene_pts, tolerance=1.5)
                if len(simplified) >= 4:
                    out_polygons.append({
                        "id": f"poly_{idx}_{i}",
                        "points": simplified
                    })

    print(f"Extracted {len(out_polygons)} coastline polygon rings in target domain.")
    
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps({
        "format": "scene_units",
        "origin": {"lat": ORIGIN_LAT, "lon": ORIGIN_LON},
        "count": len(out_polygons),
        "polygons": out_polygons
    }, indent=2), encoding="utf-8")
    
    print(f"Successfully saved to {OUT_JSON} ({OUT_JSON.stat().st_size} bytes)")

if __name__ == "__main__":
    main()
