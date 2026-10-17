"""Hoofdverwerking: foto's -> rijen (per foto/bord), plekken, concept-bestanden."""
from __future__ import annotations

import csv
import json
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path

from . import geo, ocr
from .exif import PhotoMeta, find_photos, read_meta
from .match import Match, Matcher, slugify

FLAG_NO_GPS = "geen GPS"
FLAG_ESTIMATED = "binnen, positie geschat"
FLAG_NO_TIME = "geen opnametijd"
FLAG_LOW_OCR = "lage OCR-zekerheid"
FLAG_NO_MATCH = "geen match"
FLAG_LOW_SCORE = "lage matchscore"
FLAG_NAME_ONLY = "alleen naam, geen Latijn"
FLAG_MULTI = "meerdere soorten op bord"
FLAG_ACCURACY = "GPS onnauwkeurig"
FLAG_NO_OCR = "OCR niet uitgevoerd"

LOW_OCR = 50.0
LOW_SCORE = 90.0


@dataclass
class PhotoResult:
    meta: PhotoMeta
    ocr: ocr.OcrResult
    matches: list[Match] = field(default_factory=list)
    kind: str = "overig"  # soort | tekst | overig
    flags: list[str] = field(default_factory=list)
    cluster: int | None = None
    note: str = ""


@dataclass
class Place:
    id: str
    lat: float
    lon: float
    photo_idx: list[int]
    indoor: bool = False
    zone_id: str = ""


@dataclass
class Result:
    photos: list[PhotoResult]
    places: list[Place]
    ocr_ran: bool = True

    def species_slugs(self) -> set[str]:
        return {m.slug for p in self.photos for m in p.matches}


def read_notes(folder: Path) -> tuple[str, dict[str, str]]:
    """notities.txt: vrije tekst; regels 'bestandsnaam: notitie' worden aan die foto gekoppeld."""
    f = folder / "notities.txt"
    if not f.exists():
        return "", {}
    raw = f.read_text(encoding="utf-8-sig", errors="replace")
    per_file: dict[str, str] = {}
    for line in raw.splitlines():
        head, sep, rest = line.partition(":")
        if sep and Path(head.strip()).suffix.lower() in {".jpg", ".jpeg", ".heic", ".heif", ".png"}:
            per_file[head.strip().lower()] = rest.strip()
    return raw, per_file


def classify(res: ocr.OcrResult, matches: list[Match]) -> tuple[str, list[str]]:
    flags: list[str] = []
    if matches:
        kind = "soort"
        if len(matches) > 1:
            flags.append(FLAG_MULTI)
        if any(m.score < LOW_SCORE for m in matches):
            flags.append(FLAG_LOW_SCORE)
        if any(m.via in ("nl", "en") for m in matches):
            flags.append(FLAG_NAME_ONLY)
        if res.confidence < LOW_OCR:
            flags.append(FLAG_LOW_OCR)
    elif res.alnum_len() >= 8 and res.confidence >= 30:
        kind = "tekst"
        flags += [FLAG_NO_MATCH] + ([FLAG_LOW_OCR] if res.confidence < LOW_OCR else [])
    else:
        kind = "overig"
        if res.alnum_len() >= 4:
            flags.append(FLAG_LOW_OCR)
    return kind, flags


def process_folder(
    folder: Path,
    names: list[dict],
    places_geojson: Path | None = None,
    cache_path: Path | None = None,
    workers: int = 4,
    run_ocr: bool = True,
    log=print,
) -> Result:
    paths = find_photos(folder)
    _, notes = read_notes(folder)
    metas: list[PhotoMeta] = []
    for p in paths:
        try:
            metas.append(read_meta(p))
        except Exception as ex:  # kapot bestand: melden, niet stoppen
            log(f"  ! {p.name}: kan niet lezen ({ex})")
    metas = geo.sort_photos(metas)
    # echte GPS-status vastleggen vóór schatten
    real_gps = {id(m): m.has_gps for m in metas}
    geo.estimate_positions(metas)
    clusters = geo.cluster_photos(metas)

    cache = ocr.load_cache(cache_path) if cache_path else {}
    results: list[ocr.OcrResult] = [ocr.OcrResult() for _ in metas]
    if run_ocr:
        def work(i: int) -> None:
            m = metas[i]
            key = ocr.cache_key(m.path)
            if key in cache:
                results[i] = ocr.OcrResult(**cache[key])
            else:
                results[i] = ocr.ocr_image(m.path)
                cache[key] = ocr.result_to_dict(results[i])
            log(f"  OCR {i + 1}/{len(metas)}: {m.path.name} (zekerheid {results[i].confidence:.0f})")

        with ThreadPoolExecutor(max_workers=max(1, workers)) as ex:
            list(ex.map(work, range(len(metas))))
        if cache_path:
            ocr.save_cache(cache_path, cache)

    matcher = Matcher(names)
    photos: list[PhotoResult] = []
    for i, m in enumerate(metas):
        res = results[i]
        matches = matcher.match_text(res.text)
        kind, flags = classify(res, matches)
        if not run_ocr:
            flags.append(FLAG_NO_OCR)
        if not real_gps[id(m)]:
            flags.insert(0, FLAG_ESTIMATED if m.pos_estimated else FLAG_NO_GPS)
        elif m.accuracy_m and m.accuracy_m > 30:
            flags.append(f"{FLAG_ACCURACY} ({m.accuracy_m:.0f} m)")
        if m.taken is None:
            flags.append(FLAG_NO_TIME)
        photos.append(PhotoResult(m, res, matches, kind, flags, note=notes.get(m.path.name.lower(), "")))

    zones = geo.load_zones(places_geojson) if places_geojson else []
    places: list[Place] = []
    for ci, c in enumerate(clusters, start=1):
        for pi in c.members:
            photos[pi].cluster = ci - 1
        pl = Place(
            id=f"verblijf-{ci:03d}",
            lat=c.lat,
            lon=c.lon,
            photo_idx=list(c.members),
            indoor=any(metas[pi].pos_estimated for pi in c.members),
            zone_id=geo.zone_for(zones, c.lat, c.lon) if zones else "",
        )
        places.append(pl)
    return Result(photos, places, run_ocr)


# -- uitvoerbestanden ------------------------------------------------------

SPECIES_COLS = ["scientific_name", "slug", "name_nl", "zone_id", "place_id", "last_seen",
                "wikidata_qid", "status", "notes", "park_url"]


def place_label(res: Result, pl: Place) -> str:
    sp: list[str] = []
    for pi in pl.photo_idx:
        for m in res.photos[pi].matches:
            n = m.name_nl or m.sci
            if n not in sp:
                sp.append(n)
    return f"Verblijf {pl.id[-3:]}" + (f" ({', '.join(sp[:2])})" if sp else "")


def photo_date(p: PhotoResult) -> str:
    return p.meta.taken.strftime("%Y-%m-%d") if p.meta.taken else ""


def concept_species(res: Result) -> list[dict]:
    best: dict[str, dict] = {}
    for p in res.photos:
        for m in p.matches:
            place = res.places[p.cluster] if p.cluster is not None else None
            row = {
                "scientific_name": m.sci, "slug": m.slug, "name_nl": m.name_nl or "",
                "zone_id": place.zone_id if place else "", "place_id": place.id if place else "",
                "last_seen": photo_date(p), "wikidata_qid": m.qid or "", "status": "draft",
                "notes": f"score {m.score:g}; foto {p.meta.path.name}",
                "_score": m.score,
            }
            old = best.get(m.slug)
            if old is None or m.score > old["_score"]:
                if old:
                    row["notes"] += f"; ook gezien bij {old['place_id'] or 'onbekend'}" if old["place_id"] != row["place_id"] else ""
                best[m.slug] = row
            elif old["place_id"] != row["place_id"] and row["place_id"] not in old["notes"]:
                old["notes"] += f"; ook bij {row['place_id'] or 'onbekend'}"
            if p.meta.taken and row["last_seen"] > best[m.slug]["last_seen"]:
                best[m.slug]["last_seen"] = row["last_seen"]
    rows = sorted(best.values(), key=lambda r: r["scientific_name"])
    for r in rows:
        r.pop("_score", None)
    return rows


def concept_places(res: Result) -> dict:
    feats = []
    for pl in res.places:
        dates = [photo_date(res.photos[i]) for i in pl.photo_idx if photo_date(res.photos[i])]
        props = {"id": pl.id, "kind": "enclosure", "name_nl": place_label(res, pl), "source": "veldwerk"}
        if pl.zone_id:
            props["zone_id"] = pl.zone_id
        if pl.indoor:
            props["indoor"] = True
        if dates:
            props["last_seen"] = max(dates)
        feats.append({"type": "Feature", "properties": props,
                      "geometry": {"type": "Point", "coordinates": [round(pl.lon, 6), round(pl.lat, 6)]}})
    return {"type": "FeatureCollection", "features": feats}


def write_species_csv(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=SPECIES_COLS, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def write_geojson(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


# -- controlelijst ---------------------------------------------------------

CHECK_COLS = ["rij", "foto", "tijd", "gps", "type", "ocr_tekst", "ocr_zekerheid", "wetenschappelijke_naam",
              "naam_nl", "score", "alternatief_1", "alternatief_2", "wikidata", "plaats_id", "plaats_gps",
              "zone_id", "vlaggen", "notitie", "correctie", "plaatsnaam"]


def fmt_gps(lat: float | None, lon: float | None) -> str:
    return "" if lat is None or lon is None else f"{lat:.6f}, {lon:.6f}"


def check_rows(res: Result) -> list[dict]:
    """Eén rij per foto/bord (meerdere soorten op één bord = meerdere rijen)."""
    rows: list[dict] = []
    for p in res.photos:
        place = res.places[p.cluster] if p.cluster is not None else None
        base = {
            "foto": p.meta.path.name,
            "tijd": p.meta.taken.strftime("%Y-%m-%d %H:%M:%S") if p.meta.taken else "",
            "gps": fmt_gps(p.meta.lat, p.meta.lon),
            "type": p.kind,
            "ocr_tekst": " / ".join(ln.strip() for ln in p.ocr.text.splitlines() if ln.strip()),
            "ocr_zekerheid": f"{p.ocr.confidence:.0f}",
            "plaats_id": place.id if place else "",
            "plaats_gps": fmt_gps(place.lat, place.lon) if place else "",
            "zone_id": place.zone_id if place else "",
            "vlaggen": "; ".join(p.flags),
            "notitie": p.note,
            "correctie": "",
            "plaatsnaam": "",
        }
        ms = p.matches or [None]
        for m in ms:
            r = dict(base)
            if m:
                alts = [f"{s} ({sc:g})" for s, sc in m.alternatives]
                r.update(wetenschappelijke_naam=m.sci, naam_nl=m.name_nl or "", score=f"{m.score:g}",
                         alternatief_1=alts[0] if alts else "", alternatief_2=alts[1] if len(alts) > 1 else "",
                         wikidata=m.qid or "")
            else:
                r.update(wetenschappelijke_naam="", naam_nl="", score="", alternatief_1="",
                         alternatief_2="", wikidata="")
            rows.append(r)
    for i, r in enumerate(rows, start=1):
        r["rij"] = i
    return rows


def write_check_csv(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=CHECK_COLS, delimiter=";", extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def attention_count(res: Result) -> int:
    return sum(1 for p in res.photos if p.flags)
