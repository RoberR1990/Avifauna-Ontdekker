"""Zet osm-extract.json om naar map-base.svg + georef.json."""
from __future__ import annotations

import json
import math
import random
from html import escape
from pathlib import Path

from .classify import LAYERS, classify, path_kind
from .geo import Projection, apply_affine, solve_affine

WIDTH = 1000.0
PALETTE = {
    "bg": "#f3ecd8", "green": "#cfe0b0", "wood": "#a9c98a", "garden": "#dcd9a0", "playground": "#e7d3a0",
    "water": "#a9d4e6", "water_stroke": "#7db6d0", "building": "#c9a982", "building_stroke": "#9c7c58",
    "footway": "#e9d6a4", "trail": "#d9c590", "road": "#f6efe0",
    "fence": "#8a7a5a", "tree": "#7fae6b", "boundary": "#d2691e", "poi": "#e2572c", "text": "#6b5a3e",
}
PATH_STYLE = {"road": 9.0, "footway": 4.6, "trail": 3.2, "steps": 4.2}


def _pts(proj, geom):
    return [proj.to_xy(p["lat"], p["lon"]) for p in geom]


def _d(pts, close=False):
    s = "M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in pts)
    return s + (" Z" if close else "")


def stitch(segments):
    """Voeg way-stukken van een multipolygon aaneen tot ringen."""
    segs = [list(s) for s in segments if len(s) > 1]
    rings = []
    while segs:
        cur = segs.pop(0)
        grew = True
        while grew and cur[0] != cur[-1]:
            grew = False
            for i, s in enumerate(segs):
                if s[0] == cur[-1]:
                    cur = cur + s[1:]
                elif s[-1] == cur[-1]:
                    cur = cur + s[::-1][1:]
                elif s[-1] == cur[0]:
                    cur = s[:-1] + cur
                elif s[0] == cur[0]:
                    cur = s[::-1][:-1] + cur
                else:
                    continue
                segs.pop(i)
                grew = True
                break
        rings.append(cur)
    return rings


def element_paths(el, proj):
    if el["type"] == "way":
        return [_d(_pts(proj, el["geometry"]), True)]
    out = []
    for role in ("outer", "inner"):
        segs = [[(p["lat"], p["lon"]) for p in m["geometry"]] for m in el.get("members", [])
                if m.get("role") == role and m.get("geometry")]
        for ring in stitch(segs):
            out.append(_d([proj.to_xy(la, lo) for la, lo in ring], True))
    return out


def centroid(el):
    g = el.get("geometry") if el["type"] == "way" else None
    if not g:
        return None
    return sum(p["lat"] for p in g) / len(g), sum(p["lon"] for p in g) / len(g)


def poi_color(t):
    if t.get("amenity") == "toilets":
        return "#3b7dd8"
    if t.get("amenity") in ("restaurant", "cafe", "fast_food", "ice_cream", "bar"):
        return "#e0a000"
    if t.get("barrier"):
        return "#8a7a5a"
    if t.get("zoo") or t.get("tourism") in ("attraction", "zoo"):
        return "#c0392b"
    return PALETTE["poi"]


def poi_title(t):
    kind = next((f"{k}={t[k]}" for k in ("zoo", "amenity", "tourism", "barrier", "leisure", "entrance") if k in t), "")
    name = t.get("name") or t.get("ref") or "(zonder naam)"
    return f"{name} [{kind}]" if kind else name


def build(out_dir: Path):
    data = json.loads((out_dir / "osm-extract.json").read_text(encoding="utf-8"))
    park = data["park"]
    b = park["bounds"]
    lat0, lon0 = (b["minlat"] + b["maxlat"]) / 2, (b["minlon"] + b["maxlon"]) / 2
    buf = 15.0  # m marge rond de parkgrens
    k = math.cos(math.radians(lat0))
    m_per_deg = math.radians(1) * 6371008.8
    width_m = (b["maxlon"] - b["minlon"]) * k * m_per_deg + 2 * buf
    height_m = (b["maxlat"] - b["minlat"]) * m_per_deg + 2 * buf
    scale = WIDTH / width_m
    H = round(height_m * scale)
    proj = Projection(lat0, lon0, scale, WIDTH / 2, H / 2)

    layers = {n: [] for n in LAYERS}
    for el in data["elements"]:
        layer = classify(el)
        if layer is None:
            continue
        t = el.get("tags", {})
        oid = f'{el["type"]}/{el["id"]}'
        title = f"<title>{escape(t['name'])}</title>" if t.get("name") else ""
        if layer == "boundary":
            layers[layer].append(f'<path d="{_d(_pts(proj, el["geometry"]), True)}" data-osm="{oid}"/>')
        elif layer == "buildings":
            layers[layer].append(f'<path d="{_d(_pts(proj, el["geometry"]), True)}" data-osm="{oid}">{title}</path>')
        elif layer == "water":
            ds = " ".join(element_paths(el, proj)) if (el["type"] == "relation" or el.get("geometry")) else ""
            if ds:
                layers[layer].append(f'<path d="{ds}" fill-rule="evenodd" data-osm="{oid}">{title}</path>')
        elif layer == "green":
            cls = ("wood" if t.get("natural") in ("wood", "scrub") or t.get("landuse") == "forest"
                   else "garden" if t.get("leisure") == "garden"
                   else "playground" if t.get("leisure") == "playground" else "grass")
            layers[layer].append(f'<path class="{cls}" d="{_d(_pts(proj, el["geometry"]), True)}" data-osm="{oid}">{title}</path>')
        elif layer == "paths":
            layers[layer].append(f'<path class="{path_kind(t)}" d="{_d(_pts(proj, el["geometry"]))}" data-osm="{oid}">{title}</path>')
        elif layer == "fences":
            g = el["geometry"]
            layers[layer].append(f'<path d="{_d(_pts(proj, g), g[0] == g[-1])}" data-osm="{oid}"/>')
        elif layer == "trees":
            x, y = proj.to_xy(el["lat"], el["lon"])
            layers[layer].append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="3.2"/>')
        elif layer == "pois":
            if el["type"] == "node":
                la, lo = el["lat"], el["lon"]
            else:
                c = centroid(el)
                if not c:
                    continue
                la, lo = c
            x, y = proj.to_xy(la, lo)
            layers[layer].append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="4.5" fill="{poi_color(t)}" data-osm="{oid}">'
                                 f'<title>{escape(poi_title(t))}</title></circle>')

    P = PALETTE
    css = f"""
#green path{{fill:{P['green']};stroke:none}}
#green .wood{{fill:{P['wood']}}} #green .garden{{fill:{P['garden']}}} #green .playground{{fill:{P['playground']}}}
#water path{{fill:{P['water']};stroke:{P['water_stroke']};stroke-width:1}}
#paths path{{fill:none;stroke-linecap:round;stroke-linejoin:round}}
#paths .road{{stroke:{P['road']};stroke-width:{PATH_STYLE['road']}}}
#paths .footway{{stroke:{P['footway']};stroke-width:{PATH_STYLE['footway']}}}
#paths .trail{{stroke:{P['trail']};stroke-width:{PATH_STYLE['trail']}}}
#paths .steps{{stroke:{P['trail']};stroke-width:{PATH_STYLE['steps']};stroke-dasharray:2 2}}
#fences path{{fill:none;stroke:{P['fence']};stroke-width:.8;stroke-dasharray:3 2}}
#buildings path{{fill:{P['building']};stroke:{P['building_stroke']};stroke-width:1;stroke-linejoin:round}}
#trees circle{{fill:{P['tree']};opacity:.75}}
#pois circle{{stroke:#fff;stroke-width:1.2}}
#boundary path{{fill:none;stroke:{P['boundary']};stroke-width:2.2;stroke-dasharray:8 4}}
text{{font:11px sans-serif;fill:{P['text']}}}"""
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {WIDTH:.0f} {H}" width="{WIDTH:.0f}" height="{H}">',
             "<title>Avifauna - kaartbasis (OpenStreetMap)</title>",
             f"<style>{css}</style>",
             f'<defs><clipPath id="frame"><rect width="{WIDTH:.0f}" height="{H}"/></clipPath></defs>',
             f'<rect id="background" width="{WIDTH:.0f}" height="{H}" fill="{P["bg"]}"/>',
             '<g clip-path="url(#frame)">']
    for n in LAYERS:
        parts.append(f'<g id="{n}">\n' + "\n".join(layers[n]) + "\n</g>")
    parts.append("</g>")
    parts.append(f'<text x="{WIDTH - 8:.0f}" y="{H - 8}" text-anchor="end">© OpenStreetMap-bijdragers, ODbL</text>')
    parts.append("</svg>\n")
    svg_path = out_dir / "map-base.svg"
    svg_path.write_text("\n".join(parts), encoding="utf-8")

    # --- georeferentie ---
    corners = {"NW": (b["maxlat"], b["minlon"]), "NE": (b["maxlat"], b["maxlon"]), "SW": (b["minlat"], b["minlon"])}
    cps = []
    for name, (la, lo) in corners.items():
        x, y = proj.to_xy(la, lo)
        cps.append({"name": name, "lat": la, "lon": lo, "x": round(x, 3), "y": round(y, 3)})
    t = solve_affine(cps)
    rnd = random.Random(1)
    nodes = [e for e in data["elements"] if e["type"] == "node"]
    errs = []
    for e in rnd.sample(nodes, min(40, len(nodes))):
        px, py = proj.to_xy(e["lat"], e["lon"])
        ax, ay = apply_affine(t, e["lat"], e["lon"])
        errs.append(math.hypot(px - ax, py - ay))
    cp_errs = []
    for c in cps:
        ax, ay = apply_affine(t, c["lat"], c["lon"])
        cp_errs.append(math.hypot(ax - c["x"], ay - c["y"]))
    georef = {
        "_comment": "GPS -> SVG: x = a*lon + c*lat + e ; y = b*lon + d*lat + f (map-base.svg, viewBox 0 0 W H). "
                    "Omgekeerd: lon = (d*(x-e) - c*(y-f))/det ; lat = (-b*(x-e) + a*(y-f))/det ; det = a*d - b*c.",
        "svg": {"file": "map-base.svg", "width": WIDTH, "height": H, "viewBox": f"0 0 {WIDTH:.0f} {H}"},
        "projection": {"type": "local-equirectangular", "lat0": lat0, "lon0": lon0, "cos_lat0": k,
                       "earth_radius_m": 6371008.8, "px_per_m": scale, "origin_px": [WIDTH / 2, H / 2], "north": "up"},
        "control_points": cps,
        "affine": t,
        "check": {"control_point_max_err_px": max(cp_errs), "random_nodes": len(errs),
                  "random_nodes_max_err_px": max(errs)},
        "source": {"osm_way": park["id"], "retrieved": data["retrieved"]},
        "license": "ODbL 1.0",
    }
    gp = out_dir / "georef.json"
    gp.write_text(json.dumps(georef, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return [svg_path, gp]
