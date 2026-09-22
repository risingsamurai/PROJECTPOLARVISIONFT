import math
import shapefile
from pathlib import Path
from shapely.geometry import shape, Point, LineString
from shapely.strtree import STRtree

SHP_PATH = Path("backend/data/cache/ne_10m_land/ne_10m_land.shp")

sf = shapefile.Reader(str(SHP_PATH))
# Extract all shapes south of -50 (Antarctica and sub-Antarctic islands)
land_geoms = []
for s in sf.shapes():
    if s.bbox[1] < -50.0:
        g = shape(s.__geo_interface__)
        if g.is_valid:
            land_geoms.append(g)

print(f"Loaded {len(land_geoms)} land geometries south of -50°")
tree = STRtree(land_geoms)

def is_land(lat: float, lon: float) -> bool:
    if lat > -50.0:
        return False
    p = Point(lon, lat)
    hits = tree.query(p)
    return any(land_geoms[idx].contains(p) for idx in hits)

def is_segment_land(p1: tuple[float, float], p2: tuple[float, float]) -> bool:
    if p1[0] > -50.0 and p2[0] > -50.0:
        return False
    ls = LineString([(p1[1], p1[0]), (p2[1], p2[0])])
    hits = tree.query(ls)
    return any(land_geoms[idx].intersects(ls) for idx in hits)

# Test Coordinates
start = (-68.35, -52.45)
dest = (-64.5496, -43.1029)

print(f"Start {start} is land: {is_land(*start)}")
print(f"Dest {dest} is land: {is_land(*dest)}")
print(f"Direct start->dest segment crosses land: {is_segment_land(start, dest)}")

# Known land test: Mount Vinson / Antarctic Peninsula interior
peninsula_land = (-66.0, -64.0)
print(f"Peninsula interior {peninsula_land} is land: {is_land(*peninsula_land)}")

# Known water: Drake passage
drake_water = (-58.0, -60.0)
print(f"Drake passage {drake_water} is land: {is_land(*drake_water)}")

# Known segment crossing the peninsula:
cross_peninsula = ((-65.0, -68.0), (-65.0, -58.0))
print(f"Segment crossing peninsula {cross_peninsula} crosses land: {is_segment_land(*cross_peninsula)}")
