"""Concept-places.geojson uit de OSM-uitsnede (ODbL) + voorstel soort->verblijf.

Herhaalbaar: `python -m osm places`. Zones zijn handmatig gekozen clusters (source=manual,
"(concept)"), hier benaderd als buffers rond OSM-objecten, geknipt binnen de parkgrens en
onderling niet overlappend. Verblijven/voorzieningen komen rechtstreeks uit OSM.
Veldwerk blijft leidend; Robert controleert alles.
"""
from __future__ import annotations

import csv
import json
import re
import unicodedata
from pathlib import Path

from shapely.geometry import MultiPolygon, Point, Polygon
from shapely.geometry.polygon import orient
from shapely.ops import unary_union

from .geo import Projection

BOUNDARY_WAY = 31775874
TROPENHAL_WAY = 288116561
HOOFDINGANG_NODE = 45429396
PROEFLIJST = Path(__file__).resolve().parents[1] / "proeflijst.csv"

# Zones in prioriteitsvolgorde (eerdere winnen bij overlap).
# nodes/ways = OSM-id's waaruit de convexe hull wordt gebouwd; buf = buffer in meters.
ZONES = [
    {"id": "zone-tropenhal", "name": "Tropenhal (concept)", "ways": [TROPENHAL_WAY], "hull": False, "buf": 3, "indoor": True},
    {"id": "zone-parkrestaurant", "name": "Rond het Parkrestaurant (concept)", "ways": [288116614],
     "nodes": [12988184691, 12988184692, 12988195926, 12988195925], "buf": 12},
    {"id": "zone-grote-vijver", "name": "Rond de Grote Vijver (concept)", "ways": [263332153, 1225223592],
     "nodes": [12988195706, 12988195482], "buf": 18},
    {"id": "zone-gierenvallei", "name": "Gierenvallei (concept)", "nodes": [12988195785, 12988195786], "buf": 30},
    {"id": "zone-noordpad", "name": "Noordelijk pad: apen en grazers (concept)",
     "nodes": [12988196281, 12988196280, 12988196751, 12988196667, 12988196666], "buf": 18},
    {"id": "zone-ingang", "name": "Ingangsgebied (concept)", "ways": [288117508],
     "nodes": [HOOFDINGANG_NODE, 12988195146, 12193920287], "buf": 15},
    {"id": "zone-west", "name": "Westelijk speel- en horecagebied (concept)", "ways": [288116498, 263351651],
     "nodes": [4962050304, 4960407631], "buf": 15},
    {"id": "zone-zuidwest", "name": "Zuidwestelijk deel: pelikanen en maki's (concept)",
     "nodes": [12988194513, 12988194512], "buf": 25},
    {"id": "zone-zuidoost", "name": "Zuidoostelijk deel: Emoe, zeearend en Lori landing (concept)",
     "ways": [288117477], "nodes": [12988194654, 12988195362, 12193920286], "buf": 20},
]

FACILITY_NAMES = {
    "toilet": "Toilet", "food": "Eten en drinken", "playground": "Speeltuin", "picnic": "Picknicktafel",
    "show": "Vogeldemonstratie (tribune)", "first_aid": "AED", "entrance": "Hoofdingang",
}


def kebab(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower())


class _Ctx:
    def __init__(self, extract: dict):
        self.el = {(e["type"], e["id"]): e for e in extract["elements"]}
        b = self.el[("way", BOUNDARY_WAY)]
        lats = [p["lat"] for p in b["geometry"]]
        lons = [p["lon"] for p in b["geometry"]]
        self.proj = Projection(sum(lats) / len(lats), sum(lons) / len(lons), 1.0)  # meters
        self.boundary = self.poly(BOUNDARY_WAY)

    def tags(self, typ, i):
        return self.el[(typ, i)].get("tags", {})

    def xy(self, lat, lon):
        return self.proj.to_xy(lat, lon)

    def poly(self, wid) -> Polygon:
        g = self.el[("way", wid)]["geometry"]
        return Polygon([self.xy(p["lat"], p["lon"]) for p in g]).buffer(0)

    def pt(self, nid) -> Point:
        n = self.el[("node", nid)]
        return Point(*self.xy(n["lat"], n["lon"]))

    def ll(self, x, y):
        lat, lon = self.proj.to_latlon(x, y)
        return [round(lon, 6), round(lat, 6)]

    def ll_poly(self, g: Polygon):
        g = orient(g.simplify(0.4), 1.0)
        return {"type": "Polygon", "coordinates": [[self.ll(x, y) for x, y in g.exterior.coords]]}

    def ll_point(self, p: Point):
        return {"type": "Point", "coordinates": self.ll(p.x, p.y)}


def _feat(geom, **props):
    return {"type": "Feature", "properties": props, "geometry": geom}


def _largest(g):
    if isinstance(g, MultiPolygon):
        g = max(g.geoms, key=lambda x: x.area)
    return g


def build_zones(c: _Ctx) -> dict[str, Polygon]:
    out, taken = {}, Polygon()
    for z in ZONES:
        parts = [c.poly(w) for w in z.get("ways", [])] + [c.pt(n) for n in z.get("nodes", [])]
        g = unary_union(parts)
        if z.get("hull", True):
            g = g.convex_hull
        g = g.buffer(z["buf"]).intersection(c.boundary).difference(taken).buffer(0)
        g = _largest(g)
        out[z["id"]] = g
        taken = taken.union(g.buffer(0.3))  # kleine marge tegen afrondings-overlap
    return out


def _enclosure_id(name: str, used: set) -> str:
    items = [i.strip() for i in name.split(",")]
    base = "verblijf-" + kebab(" ".join(items[:2]))
    i, cand = 2, base
    while cand in used:
        cand, i = f"{base}-{i}", i + 1
    used.add(cand)
    return cand


def _zone_for(p: Point, zones: dict[str, Polygon], max_m=60.0):
    zid, g = min(zones.items(), key=lambda kv: kv[1].distance(p))
    return zid if g.distance(p) <= max_m else None


def build_places(extract: dict) -> dict:
    c = _Ctx(extract)
    zones = build_zones(c)
    feats = []
    for z in ZONES:
        props = dict(id=z["id"], kind="zone", name_nl=z["name"], source="manual")
        if z.get("indoor"):
            props["indoor"] = True
        feats.append(_feat(c.ll_poly(zones[z["id"]]), **props))

    # verblijven
    used: set = set()
    nodes = sorted((e for e in extract["elements"] if e["type"] == "node"
                    and e.get("tags", {}).get("tourism") == "attraction" and e["tags"].get("attraction") == "animal"),
                   key=lambda e: e["id"])
    for n in nodes:
        name = n["tags"]["name"]
        if name == "Vogeldemonstratie":
            continue  # wordt facility (show)
        p = c.pt(n["id"])
        props = dict(id=_enclosure_id(name, used), kind="enclosure", name_nl=name, source="osm")
        zid = _zone_for(p, zones)
        if zid:
            props["zone_id"] = zid
        feats.append(_feat(c.ll_point(p), **props))

    # voorzieningen
    fac: list = []
    for e in extract["elements"]:
        t = e.get("tags", {})
        if e["type"] == "node":
            p = c.pt(e["id"])
            if t.get("amenity") == "toilets":
                fac.append(("toilet", e["id"], p, None))
            elif t.get("amenity") == "restaurant":
                fac.append(("food", e["id"], p, None))
            elif t.get("leisure") == "picnic_table":
                fac.append(("picnic", e["id"], p, None))
            elif t.get("emergency") == "defibrillator":
                fac.append(("first_aid", e["id"], p, False if t.get("indoor") == "no" else None))
            elif e["id"] == HOOFDINGANG_NODE:
                fac.append(("entrance", e["id"], p, None))
        elif e["type"] == "way":
            if e["id"] == 288116614:  # Parkrestaurant (gebouw)
                fac.append(("food", e["id"], c.poly(e["id"]).representative_point(), True))
            elif t.get("leisure") == "playground":
                fac.append(("playground", e["id"], c.poly(e["id"]).representative_point(), None))
            elif t.get("leisure") == "bleachers":
                fac.append(("show", e["id"], c.poly(e["id"]).centroid, None))
    inside = c.boundary.buffer(5)
    counts: dict = {}
    for ftype, oid, p, indoor in sorted(fac, key=lambda f: (f[0], f[1])):
        if not inside.contains(p):
            continue
        counts[ftype] = counts.get(ftype, 0) + 1
        typ = "way" if (ftype, oid) and ("way", oid) in c.el else "node"
        name = c.tags(typ, oid).get("name") or FACILITY_NAMES[ftype]
        if ftype in ("toilet", "first_aid", "show", "entrance"):
            name = FACILITY_NAMES[ftype]
        props = dict(id=f"voorziening-{ftype.replace('_', '-')}-{counts[ftype]}", kind="facility",
                     name_nl=name, facility_type=ftype, source="osm")
        zid = _zone_for(p, zones)
        if zid:
            props["zone_id"] = zid
        if indoor is not None:
            props["indoor"] = indoor
        feats.append(_feat(c.ll_point(p), **props))

    # anchors: ingangen die vlak bij de Tropenhal liggen
    th = c.poly(TROPENHAL_WAY)
    k = 0
    for e in sorted((e for e in extract["elements"] if e["type"] == "node" and e.get("tags", {}).get("entrance")),
                    key=lambda e: e["id"]):
        if e["id"] != HOOFDINGANG_NODE and th.distance(c.pt(e["id"])) <= 8:
            k += 1
            feats.append(_feat(c.ll_point(c.pt(e["id"])), id=f"anker-tropenhal-{k}", kind="anchor",
                               name_nl=f"Ingang Tropenhal {k}", zone_id="zone-tropenhal", source="osm"))
    return {"type": "FeatureCollection", "name": "avifauna-places-concept-osm", "features": feats}


# --- soort -> verblijf -------------------------------------------------------------------
def species_places(fc: dict, proeflijst: Path = PROEFLIJST) -> list:
    encl = [f["properties"] for f in fc["features"] if f["properties"]["kind"] == "enclosure"]
    rows = []
    with open(proeflijst, encoding="utf-8", newline="") as fh:
        for r in csv.DictReader(fh):
            key = _norm(r["name_nl"])
            exact, suffix = [], []
            for p in encl:
                for item in p["name_nl"].split(","):
                    for part in item.split(" - "):
                        n = _norm(part)
                        if n == key:
                            exact.append(p)
                        elif n.endswith(key):
                            suffix.append(p)
            hits = list({p["id"]: p for p in (exact or suffix)}.values())
            sci = r["scientific_name"].strip()
            row = {"scientific_name": sci, "slug": sci.lower().replace(" ", "-"), "place_id": "", "zone_id": "", "basis": ""}
            if hits:
                zs = {h.get("zone_id", "") for h in hits}
                row["zone_id"] = zs.pop() if len(zs) == 1 else ""
                if len(hits) == 1:
                    row["place_id"] = hits[0]["id"]
                    row["basis"] = f"osm-naam: {hits[0]['name_nl']}"
                else:
                    row["basis"] = "osm-naam, meerdere verblijven (place_id leeg): " + " | ".join(
                        f"{h['name_nl']} [{h['id']}]" for h in hits)
            rows.append(row)
    return rows


# --- preview ---------------------------------------------------------------------------
def preview(fc: dict, map_dir: Path, out: Path):
    from PIL import Image, ImageDraw, ImageFont
    from .geo import apply_affine

    t = json.loads((map_dir / "georef.json").read_text(encoding="utf-8"))["affine"]
    base = Image.open(map_dir / "map-base.preview.png").convert("RGBA")
    over = Image.new("RGBA", base.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(over)
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/arialn.ttf", 13)
        bold = ImageFont.truetype("C:/Windows/Fonts/arialnb.ttf", 15)
    except OSError:
        font = bold = ImageFont.load_default()

    def px(lonlat):
        return apply_affine(t, lonlat[1], lonlat[0])

    pal = [(231, 76, 60), (52, 152, 219), (155, 89, 182), (46, 204, 113), (241, 196, 15),
           (230, 126, 34), (26, 188, 156), (233, 30, 99), (96, 125, 139)]
    zcol = {}
    for i, f in enumerate(x for x in fc["features"] if x["properties"]["kind"] == "zone"):
        col = pal[i % len(pal)]
        zcol[f["properties"]["id"]] = col
        pts = [px(p) for p in f["geometry"]["coordinates"][0]]
        d.polygon(pts, fill=col + (70,), outline=col + (255,), width=2)
        cx = sum(p[0] for p in pts) / len(pts)
        cy = sum(p[1] for p in pts) / len(pts)
        label = f["properties"]["name_nl"].replace(" (concept)", "")
        d.text((cx, cy), label, font=bold, fill=(20, 20, 20, 255), anchor="mm", stroke_width=3,
               stroke_fill=(255, 255, 255, 230))
    for f in fc["features"]:
        p = f["properties"]
        if p["kind"] == "zone":
            continue
        x, y = px(f["geometry"]["coordinates"])
        col = zcol.get(p.get("zone_id"), (60, 60, 60))
        box = [x - 5, y - 5, x + 5, y + 5]
        if p["kind"] == "enclosure":
            d.ellipse(box, fill=col + (255,), outline=(0, 0, 0, 255), width=1)
            label = p["name_nl"].split(",")[0]
        elif p["kind"] == "facility":
            d.rectangle(box, fill=(255, 255, 255, 255), outline=(0, 0, 0, 255), width=2)
            label = p["facility_type"]
        else:
            d.polygon([(x, y - 6), (x + 6, y), (x, y + 6), (x - 6, y)], fill=(0, 0, 0, 255))
            label = "ingang hal"
        d.text((x + 7, y - 6), label, font=font, fill=(0, 0, 0, 255), stroke_width=2,
               stroke_fill=(255, 255, 255, 230))
    Image.alpha_composite(base, over).convert("RGB").save(out)


def build(map_dir: Path):
    extract = json.loads((map_dir / "osm-extract.json").read_text(encoding="utf-8"))
    fc = build_places(extract)
    out_geo = map_dir.parent / "places.geojson"
    out_geo.write_text(json.dumps(fc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    out_csv = map_dir / "species-places.concept.csv"
    with open(out_csv, "w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=["scientific_name", "slug", "place_id", "zone_id", "basis"],
                           lineterminator="\n")
        w.writeheader()
        w.writerows(species_places(fc))
    out_png = map_dir / "places.preview.png"
    preview(fc, map_dir, out_png)
    return [out_geo, out_csv, out_png]
