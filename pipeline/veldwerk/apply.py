"""apply: gecorrigeerde controlelijst.csv -> parks/avifauna/species.csv en places.geojson (samenvoegen, niet overschrijven).

Betekenis van de kolom `correctie` (leeg = niets besloten):
  ok                      match akkoord -> status confirmed
  <Genus species>         andere soort (wetenschappelijke naam) -> confirmed
  weg  (of -, x)          rij negeren
  verblijf [naam]         (overig-foto) dit is een verblijf; naam optioneel
  facility:<type> [naam]  (overig-foto) voorziening, bv. `facility:toilet Toiletten bij ingang`
Kolom `plaatsnaam`: naam voor het verblijf (geldt voor de hele plek).
Rijen met een match maar lege correctie komen als status=draft mee; rijen zonder match en zonder correctie vervallen.
"""
from __future__ import annotations

import csv
import json
import re
from pathlib import Path

from . import geo
from .match import slugify
from .process import SPECIES_COLS

FACILITY_TYPES = {"toilet", "baby_change", "food", "water", "playground", "picnic", "show", "feeding",
                  "entrance", "exit", "first_aid", "info", "shelter"}
FACILITY_NL = {"toilet": "Toilet", "baby_change": "Verschoontafel", "food": "Eten en drinken", "water": "Waterpunt",
               "playground": "Speeltuin", "picnic": "Picknickplek", "show": "Vogelshow", "feeding": "Voerplek",
               "entrance": "Ingang", "exit": "Uitgang", "first_aid": "EHBO", "info": "Informatie", "shelter": "Overdekte plek"}
DROP = {"weg", "-", "x", "verwijder"}
_ID_NUM = re.compile(r"^(.*?)-(\d+)$")


def read_check_csv(path: Path) -> list[dict]:
    text = path.read_text(encoding="utf-8-sig")
    header = text.splitlines()[0] if text else ""
    delim = ";" if header.count(";") >= header.count(",") else ","
    import io

    return list(csv.DictReader(io.StringIO(text), delimiter=delim))


def parse_gps(s: str) -> tuple[float, float] | None:
    m = re.match(r"^\s*(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)\s*$", s or "")
    return (float(m.group(1)), float(m.group(2))) if m else None


def read_species(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with open(path, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def _next_id(prefix: str, existing: set[str]) -> str:
    n = 1
    for i in existing:
        m = _ID_NUM.match(i)
        if m and m.group(1) == prefix:
            n = max(n, int(m.group(2)) + 1)
    return f"{prefix}-{n:03d}"


def _norm_sci(s: str) -> str:
    parts = s.strip().split()
    return f"{parts[0].capitalize()} {parts[1].lower()}" if len(parts) >= 2 else s.strip()


def apply_rows(rows: list[dict], species: list[dict], places: dict, names: list[dict] | None = None) -> tuple[list[dict], dict, dict]:
    """Zuivere samenvoeglogica. Geeft (species, places, statistieken)."""
    qid_by_sci = {e["sci"].lower(): e for e in (names or [])}
    feats = places.setdefault("features", [])
    ids = {f["properties"]["id"] for f in feats}
    zones = []
    from shapely.geometry import shape

    for f in feats:
        if f["properties"].get("kind") == "zone" and f.get("geometry"):
            zones.append((f["properties"]["id"], shape(f["geometry"])))
    stats = {"soorten_nieuw": 0, "soorten_bijgewerkt": 0, "soorten_behouden": 0, "plekken_nieuw": 0,
             "plekken_hergebruikt": 0, "voorzieningen": 0, "genegeerd": 0}

    # 1. plek per concept-id: naam en positie verzamelen uit de rijen die meedoen
    concept: dict[str, dict] = {}
    parsed: list[dict] = []
    for r in rows:
        corr = (r.get("correctie") or "").strip()
        low = corr.lower()
        if low in DROP:
            stats["genegeerd"] += 1
            continue
        sci = (r.get("wetenschappelijke_naam") or "").strip()
        entry = {"row": r, "kind": None, "status": "draft", "sci": sci, "text": ""}
        if low.startswith("facility:"):
            ftype, _, name = corr[len("facility:"):].partition(" ")
            if ftype.strip().lower() not in FACILITY_TYPES:
                stats["genegeerd"] += 1
                continue
            entry.update(kind="facility", ftype=ftype.strip().lower(), text=name.strip())
        elif low.startswith("verblijf"):
            entry.update(kind="enclosure", text=corr[len("verblijf"):].strip())
        elif low == "ok":
            if not sci:
                stats["genegeerd"] += 1
                continue
            entry.update(kind="species", status="confirmed")
        elif corr:
            entry.update(kind="species", status="confirmed", sci=_norm_sci(corr))
        elif sci:
            entry.update(kind="species", status="draft")
        else:
            stats["genegeerd"] += 1
            continue
        parsed.append(entry)
        pid, pos = (r.get("plaats_id") or "").strip(), parse_gps(r.get("plaats_gps") or "")
        if pid and pos and entry["kind"] != "facility":
            c = concept.setdefault(pid, {"pos": pos, "name": "", "species": [], "dates": [], "final": None})
            if (r.get("plaatsnaam") or "").strip():
                c["name"] = r["plaatsnaam"].strip()
            if entry["kind"] == "enclosure" and entry["text"] and not c["name"]:
                c["name"] = entry["text"]

    # 2. concept-plek -> definitieve plek (bestaande hergebruiken binnen 12 m, anders nieuw)
    def final_place(pid: str, label_fallback: str) -> str | None:
        c = concept.get(pid)
        if not c:
            return None
        if c["final"]:
            return c["final"]
        lat, lon = c["pos"]
        for f in feats:
            p = f["properties"]
            if p.get("kind") == "enclosure" and f["geometry"]["type"] == "Point":
                flon, flat = f["geometry"]["coordinates"]
                if geo.haversine_m(lat, lon, flat, flon) <= geo.CLUSTER_M:
                    c["final"] = p["id"]
                    stats["plekken_hergebruikt"] += 1
                    return c["final"]
        new_id = _next_id("verblijf", ids)
        ids.add(new_id)
        props = {"id": new_id, "kind": "enclosure", "name_nl": c["name"] or label_fallback or f"Verblijf {new_id[-3:]}",
                 "source": "veldwerk"}
        z = geo.zone_for(zones, lat, lon) if zones else ""
        if z:
            props["zone_id"] = z
        feats.append({"type": "Feature", "properties": props,
                      "geometry": {"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]}})
        c["final"] = new_id
        stats["plekken_nieuw"] += 1
        return new_id

    # 3. soorten en voorzieningen
    by_slug = {s["slug"]: s for s in species}
    new_by_slug: dict[str, dict] = {}
    for e in parsed:
        r = e["row"]
        date = (r.get("tijd") or "")[:10]
        pos = parse_gps(r.get("plaats_gps") or "") or parse_gps(r.get("gps") or "")
        if e["kind"] == "facility":
            if not pos:
                stats["genegeerd"] += 1
                continue
            lat, lon = pos
            fid = _next_id(e["ftype"].replace("_", "-"), ids)
            ids.add(fid)
            props = {"id": fid, "kind": "facility", "name_nl": e["text"] or FACILITY_NL[e["ftype"]],
                     "facility_type": e["ftype"], "source": "veldwerk"}
            if date:
                props["last_seen"] = date
            z = geo.zone_for(zones, lat, lon) if zones else ""
            if z:
                props["zone_id"] = z
            feats.append({"type": "Feature", "properties": props,
                          "geometry": {"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]}})
            stats["voorzieningen"] += 1
            continue
        pid = (r.get("plaats_id") or "").strip()
        if e["kind"] == "enclosure":
            final_place(pid, "")
            continue
        sci = e["sci"]
        slug = slugify(sci)
        label = f"Verblijf ({(r.get('naam_nl') or sci)})"
        place_id = final_place(pid, label) or ""
        zone_id = (r.get("zone_id") or "").strip()
        if place_id:
            for f in feats:
                if f["properties"]["id"] == place_id and f["properties"].get("zone_id"):
                    zone_id = f["properties"]["zone_id"]
        ref = qid_by_sci.get(sci.lower(), {})
        row = {"scientific_name": sci, "slug": slug,
               "name_nl": (r.get("naam_nl") if sci == (r.get("wetenschappelijke_naam") or "").strip() else "") or ref.get("nl") or "",
               "zone_id": zone_id, "place_id": place_id, "last_seen": date,
               "wikidata_qid": (r.get("wikidata") if sci == (r.get("wetenschappelijke_naam") or "").strip() else "") or ref.get("qid") or "",
               "status": e["status"], "notes": "veldwerk" + (f"; foto {r.get('foto')}" if r.get("foto") else ""),
               "_score": float(r.get("score") or 0)}
        old = new_by_slug.get(slug)
        if old is None:
            new_by_slug[slug] = row
        else:
            better = (row["status"] == "confirmed" and old["status"] != "confirmed") or (
                row["status"] == old["status"] and row["_score"] > old["_score"])
            keep, other = (row, old) if better else (old, row)
            if other["place_id"] and other["place_id"] != keep["place_id"]:
                keep["notes"] += f"; ook bij {other['place_id']}"
            keep["last_seen"] = max(keep["last_seen"], other["last_seen"])
            new_by_slug[slug] = keep

    out = list(species)
    for slug, row in new_by_slug.items():
        row.pop("_score", None)
        old = by_slug.get(slug)
        if old is None:
            out.append(row)
            stats["soorten_nieuw"] += 1
        elif old.get("status") in ("confirmed", "absent"):
            for k in ("name_nl", "zone_id", "place_id", "last_seen", "wikidata_qid"):  # alleen lege velden aanvullen
                if not (old.get(k) or "").strip() and row.get(k):
                    old[k] = row[k]
            stats["soorten_behouden"] += 1
        else:  # bestaande draft: vervangen door de nieuwere uitkomst
            old.update(row)
            stats["soorten_bijgewerkt"] += 1
    out.sort(key=lambda s: s["scientific_name"])
    return out, places, stats


def run_apply(check_csv: Path, park_dir: Path, names: list[dict] | None = None) -> dict:
    from .process import write_geojson, write_species_csv

    rows = read_check_csv(check_csv)
    species = read_species(park_dir / "species.csv")
    pg = park_dir / "places.geojson"
    places = json.loads(pg.read_text(encoding="utf-8")) if pg.exists() else {"type": "FeatureCollection", "features": []}
    out_sp, out_pl, stats = apply_rows(rows, species, places, names)
    write_species_csv(park_dir / "species.csv", out_sp)
    write_geojson(pg, out_pl)
    return stats
