"""Afstanden, clusteren tot plekken, positie schatten voor foto's zonder GPS, zones."""
from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from datetime import timedelta
from pathlib import Path

from .exif import PhotoMeta

CLUSTER_M = 12.0
MAX_TIME_GAP = timedelta(minutes=30)  # binnen een plek mag er niet langer dan dit tussen foto's zitten
INDOOR_MAX_GAP = timedelta(minutes=15)  # tussen twee GPS-foto's: daarbinnen schatten we binnenfoto's


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371008.8
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


@dataclass
class Cluster:
    members: list[int] = field(default_factory=list)  # indexen in de fotolijst
    lat: float = 0.0
    lon: float = 0.0
    n_pos: int = 0  # aantal echte GPS-posities in het gemiddelde

    def add_pos(self, lat: float, lon: float) -> None:
        self.lat = (self.lat * self.n_pos + lat) / (self.n_pos + 1)
        self.lon = (self.lon * self.n_pos + lon) / (self.n_pos + 1)
        self.n_pos += 1


def sort_photos(photos: list[PhotoMeta]) -> list[PhotoMeta]:
    """Op opnametijd, dan bestandsnaam. Foto's zonder tijd komen achteraan."""
    return sorted(photos, key=lambda p: (p.taken is None, p.taken or 0, p.path.name))


def estimate_positions(photos: list[PhotoMeta]) -> None:
    """Foto's zonder GPS tussen twee GPS-foto's (binnen INDOOR_MAX_GAP) krijgen een
    in de tijd geïnterpoleerde positie; `pos_estimated` wordt True. `photos` moet gesorteerd zijn."""
    for i, p in enumerate(photos):
        if p.has_gps or p.taken is None:
            continue
        prev = next((q for q in reversed(photos[:i]) if q.has_gps and q.taken), None)
        nxt = next((q for q in photos[i + 1:] if q.has_gps and q.taken), None)
        if not prev or not nxt or (nxt.taken - prev.taken) > INDOOR_MAX_GAP:
            continue
        span = (nxt.taken - prev.taken).total_seconds()
        t = 0.5 if span <= 0 else (p.taken - prev.taken).total_seconds() / span
        p.lat = prev.lat + (nxt.lat - prev.lat) * t
        p.lon = prev.lon + (nxt.lon - prev.lon) * t
        p.pos_estimated = True


def cluster_photos(photos: list[PhotoMeta], radius_m: float = CLUSTER_M) -> list[Cluster]:
    """Opeenvolgende foto's (op tijd) binnen `radius_m` van het clustermidden horen bij dezelfde plek.

    Een nieuwe plek begint bij meer afstand of een lange pauze. Geschatte posities tellen niet
    mee voor het midden. Foto's zonder positie komen in geen enkel cluster.
    `photos` moet gesorteerd zijn (sort_photos)."""
    clusters: list[Cluster] = []
    cur: Cluster | None = None
    last_time = None
    for i, p in enumerate(photos):
        if not p.has_gps:
            continue
        if p.pos_estimated and cur is not None:  # binnenfoto: hoort bij de plek van de ankerfoto ervoor
            cur.members.append(i)
            continue
        near = (
            cur is not None
            and haversine_m(cur.lat, cur.lon, p.lat, p.lon) <= radius_m
            and not (p.taken and last_time and (p.taken - last_time) > MAX_TIME_GAP)
        )
        if not near:
            cur = Cluster(lat=p.lat, lon=p.lon, n_pos=0)
            clusters.append(cur)
        cur.members.append(i)
        if not p.pos_estimated or cur.n_pos == 0:
            cur.add_pos(p.lat, p.lon)
        if p.taken:
            last_time = p.taken
    return clusters


# -- zones ---------------------------------------------------------------

def load_zones(places_geojson: Path):
    """[(zone_id, shapely-polygoon)] uit places.geojson (kind=zone). Leeg als het bestand ontbreekt."""
    if not places_geojson.exists():
        return []
    from shapely.geometry import shape

    data = json.loads(places_geojson.read_text(encoding="utf-8"))
    zones = []
    for f in data.get("features", []):
        props = f.get("properties") or {}
        if props.get("kind") == "zone" and f.get("geometry"):
            zones.append((props["id"], shape(f["geometry"])))
    return zones


def zone_for(zones, lat: float, lon: float) -> str:
    from shapely.geometry import Point

    pt = Point(lon, lat)
    for zid, poly in zones:
        if poly.contains(pt):
            return zid
    return ""
