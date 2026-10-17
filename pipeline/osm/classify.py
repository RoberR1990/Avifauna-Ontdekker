"""Classificatie van OSM-elementen naar kaartlagen."""
from __future__ import annotations

PATH_HIGHWAYS = {"footway", "path", "pedestrian", "steps", "cycleway", "track", "bridleway", "corridor"}
ROAD_HIGHWAYS = {"service", "residential", "unclassified", "tertiary", "secondary", "primary",
                 "living_street", "road", "tertiary_link"}
GREEN_LANDUSE = {"grass", "forest", "meadow", "village_green", "recreation_ground", "greenfield", "flowerbed", "orchard"}
GREEN_NATURAL = {"wood", "scrub", "grassland", "heath", "tree_row", "shrub", "wetland"}
GREEN_LEISURE = {"garden", "park", "playground", "picnic_table", "pitch", "nature_reserve"}
POI_AMENITY = {"toilets", "restaurant", "cafe", "fast_food", "bench", "drinking_water", "shelter", "waste_basket",
               "bicycle_parking", "parking", "ice_cream", "bar", "pub", "first_aid", "baby_changing", "vending_machine"}
POI_TOURISM = {"information", "attraction", "zoo", "picnic_site", "museum", "gallery", "viewpoint", "artwork"}

LAYERS = ["green", "water", "paths", "fences", "buildings", "trees", "pois", "boundary"]


def is_area_way(el: dict) -> bool:
    g = el.get("geometry")
    if el["type"] != "way" or not g or len(g) < 4:
        return False
    t = el.get("tags", {})
    if t.get("area") == "yes":
        return True
    return g[0] == g[-1] and not (t.get("highway") and t.get("area") != "yes") and "barrier" not in t


def classify(el: dict) -> str | None:
    """Geeft laagnaam of None. Volgorde: grens, gebouw, water, hekwerk, pad, groen, poi."""
    t = el.get("tags", {})
    if not t:
        return None
    if t.get("tourism") == "zoo" and el["type"] != "node":
        return "boundary"
    if "building" in t:
        return "buildings"
    if t.get("natural") == "tree" and el["type"] == "node":
        return "trees"
    if t.get("natural") == "water" or t.get("leisure") == "swimming_pool" or "water" in t or "waterway" in t or t.get("landuse") in ("basin", "reservoir"):
        return "water"
    if "barrier" in t and el["type"] == "way":
        return "fences"
    if "highway" in t and el["type"] == "way" and t["highway"] in PATH_HIGHWAYS | ROAD_HIGHWAYS:
        return "paths"
    if el["type"] == "way" and (t.get("landuse") in GREEN_LANDUSE or t.get("natural") in GREEN_NATURAL
                                or t.get("leisure") in GREEN_LEISURE) and is_area_way(el):
        return "green"
    if el["type"] == "node" and (t.get("amenity") in POI_AMENITY or t.get("barrier") in ("gate", "lift_gate")
                                 or t.get("amenity") in ("fountain", "charging_station") or t.get("tourism") in POI_TOURISM
                                 or "entrance" in t or "zoo" in t or t.get("leisure") in GREEN_LEISURE
                                 or "emergency" in t or t.get("shop")):
        return "pois"
    if el["type"] == "way" and (t.get("amenity") in POI_AMENITY or t.get("tourism") in POI_TOURISM or "zoo" in t) \
            and is_area_way(el):
        return "pois"  # vlak-POI (bv. verblijf) -> centroïde
    return None


def path_kind(t: dict) -> str:
    h = t.get("highway", "")
    if h in ROAD_HIGHWAYS:
        return "road"
    if h in ("steps",):
        return "steps"
    if h in ("track", "path", "bridleway"):
        return "trail"
    return "footway"
