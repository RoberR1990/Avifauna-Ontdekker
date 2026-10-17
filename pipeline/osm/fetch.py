"""Haal OSM-data rond het park op via Overpass."""
from __future__ import annotations

import datetime as dt
import json
import math
import time
from pathlib import Path

import requests
from shapely.geometry import Polygon

UA = "AvifaunaOntdekker/0.1 (https://github.com/RoberR1990/Avifauna-Ontdekker)"
ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
PARK_WAY_ID = 31775874  # tourism=zoo, name=Avifauna
BUFFER_M = 30.0


def overpass(query: str) -> dict:
    last = None
    for attempt in range(2):
        for url in ENDPOINTS:
            try:
                r = requests.post(url, data={"data": query}, headers={"User-Agent": UA}, timeout=120)
                if r.status_code == 200:
                    return r.json()
                last = f"{url}: HTTP {r.status_code}"
            except requests.RequestException as e:
                last = f"{url}: {e}"
            time.sleep(2)
    raise RuntimeError(f"Overpass mislukt: {last}")


def buffered_poly(geometry: list[dict], buffer_m: float = BUFFER_M) -> list[tuple[float, float]]:
    """Buffer een lat/lon-polygoon in meters; geeft (lat, lon)-ring."""
    lat0 = sum(p["lat"] for p in geometry) / len(geometry)
    kx = 111320.0 * math.cos(math.radians(lat0))
    ky = 110574.0
    poly = Polygon([(p["lon"] * kx, p["lat"] * ky) for p in geometry]).buffer(buffer_m, join_style=2)
    poly = poly.simplify(2.0)
    return [(y / ky, x / kx) for x, y in poly.exterior.coords]


def build_query(ring: list[tuple[float, float]]) -> str:
    poly = " ".join(f"{la:.6f} {lo:.6f}" for la, lo in ring[:-1])
    p = f'(poly:"{poly}")'
    return f"""[out:json][timeout:90];
(
  way["highway"]{p};
  way["building"]{p};
  nwr["natural"~"water|wood|scrub|grassland|heath|wetland|tree_row"]{p};
  nwr["water"]{p};
  way["waterway"]{p};
  way["landuse"]{p};
  nwr["leisure"]{p};
  way["barrier"]{p};
  node["barrier"]{p};
  nwr["amenity"]{p};
  nwr["tourism"]{p};
  nwr["zoo"]{p};
  nwr["entrance"]{p};
  nwr["emergency"]{p};
  nwr["shop"]{p};
  nwr["man_made"]{p};
  node["natural"="tree"]{p};
);
out geom tags;
"""


def fetch(out_dir: Path) -> Path:
    park = overpass(f"[out:json];way({PARK_WAY_ID});out geom tags;")["elements"][0]
    ring = buffered_poly(park["geometry"])
    q = build_query(ring)
    data = overpass(q)
    out = {
        "retrieved": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "source": "OpenStreetMap via Overpass API",
        "license": "ODbL 1.0 - https://www.openstreetmap.org/copyright",
        "osm_base": data.get("osm3s", {}).get("timestamp_osm_base"),
        "park": {"type": "way", "id": PARK_WAY_ID, "tags": park.get("tags", {}),
                 "bounds": park.get("bounds"), "geometry": park["geometry"]},
        "buffer_m": BUFFER_M,
        "query": q,
        "elements": data["elements"],
    }
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / "osm-extract.json"
    path.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return path
