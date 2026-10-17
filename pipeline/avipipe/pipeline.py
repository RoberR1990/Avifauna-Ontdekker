"""Orkestratie brons -> zilver -> goud."""
from __future__ import annotations

import csv
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

from . import commons, wikidata, xenocanto
from .config import find_ffmpeg, today
from .http import Http
from .licenses import slugify

log = logging.getLogger("avipipe")

STEPS = ["wikidata", "photos", "audio", "gold"]


def read_species_csv(path: Path) -> list[dict]:
    rows = []
    with open(path, encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            name = (r.get("scientific_name") or "").strip()
            if not name:
                log.warning("Rij zonder scientific_name overgeslagen: %s", r)
                continue
            rows.append({
                "scientific_name": name,
                "slug": (r.get("slug") or "").strip() or slugify(name),
                "name_nl": (r.get("name_nl") or "").strip() or None,
                "zone_id": (r.get("zone_id") or "").strip() or None,
                "place_id": (r.get("place_id") or "").strip() or None,
                "last_seen": (r.get("last_seen") or "").strip() or None,
                "notes": (r.get("notes") or "").strip() or None,
            })
    return rows


def _write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _read_json(path: Path, default=None):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


# ------------------------------------------------------------------ stappen


def step_wikidata(http: Http, species: list[dict], out: Path) -> list[dict]:
    bronze: dict = {}
    names = [s["scientific_name"] for s in species]
    resolved = wikidata.resolve_names(http, names, bronze)
    qids = sorted({r["qid"] for r in resolved.values() if r["qid"]})
    fields = wikidata.fetch_fields(http, qids, bronze) if qids else {}
    _write_json(out / "bronze" / "wikidata.json", bronze)
    result = []
    for s in species:
        res = resolved[s["scientific_name"]]
        f = fields.get(res["qid"]) if res["qid"] else None
        rec = {
            **s,
            "qid": res["qid"], "match": res["match"], "matched_name": res["matched_name"],
            **(f or {k: None for k in wikidata._empty() if not k.startswith("_")}),
            "photo": None, "photo_rejected": [], "audio": [],
        }
        if f is None:
            rec["image_files"] = []
        result.append(rec)
    return result


def step_photos(http: Http, silver: list[dict], out: Path, media_dir: Path, attributions: list[dict]) -> None:
    bronze: dict = {}
    for s in silver:
        s["photo"], s["photo_rejected"] = None, []
        if not s["qid"]:
            continue
        try:
            cand, rejected = commons.pick_photo(http, s["image_files"], s["commons_category"], bronze.setdefault(s["slug"], {}))
            s["photo_rejected"] = rejected
            if not cand:
                log.info("Geen toegestane foto voor %s", s["scientific_name"])
                continue
            recs = commons.build_photo(http, cand, s["slug"], media_dir)
        except Exception as e:
            log.warning("Foto mislukt voor %s: %s", s["scientific_name"], e)
            continue
        _put_records(attributions, recs)
        s["photo"] = {"file": recs[0]["file"], "license": recs[0]["license"], "title": recs[0]["title"]}
    _write_json(out / "bronze" / "commons.json", bronze)


def _put_records(attributions: list[dict], recs: list[dict]) -> None:
    for r in recs:
        attributions[:] = [a for a in attributions if a["file"] != r["file"]]
        attributions.append(r)


def step_audio(http: Http, silver: list[dict], out: Path, media_dir: Path, attributions: list[dict], nc_dir=None) -> str:
    key = os.environ.get("XENO_CANTO_API_KEY", "").strip()
    if not key:
        msg = "Audio overgeslagen: geen XENO_CANTO_API_KEY (zet hem in .env in de repo-root)."
        log.warning(msg)
        return msg
    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        msg = "Audio overgeslagen: ffmpeg niet gevonden (zet env FFMPEG of zet ffmpeg op PATH)."
        log.warning(msg)
        return msg
    bronze: dict = {}
    n = 0
    for s in silver:
        s["audio"] = []
        recs = xenocanto.process_species(http, s["scientific_name"], s["slug"], media_dir, key, ffmpeg, bronze, nc_dir)
        if recs:
            n += 1
            _put_records(attributions, recs)
            s["audio"] = [{"file": r["file"], "license": r["license"], "in_repo": r["in_repo"]} for r in recs]
    _write_json(out / "bronze" / "xeno-canto.json", bronze)
    return f"Audio: {n}/{len(silver)} soorten"


def build_gold(silver: list[dict], attributions: list[dict], park: dict, lang: str) -> dict:
    index = {a["file"]: i for i, a in enumerate(attributions)}
    other = "en" if lang == "nl" else "nl"
    species = []
    for s in silver:
        labels = {"nl": s.get("name_nl") or s.get("label_nl"), "en": s.get("label_en")}
        name = labels[lang] or labels[other] or s["scientific_name"]
        alt = labels[other] if labels[other] and labels[other] != name else None
        wiki = s.get("wikipedia_" + lang) or s.get("wikipedia_" + other)
        photo = None
        if s.get("photo") and s["photo"]["file"] in index:
            photo = {"file": s["photo"]["file"], "attribution_index": index[s["photo"]["file"]]}
        audio = [{"file": a["file"], "attribution_index": index[a["file"]]} for a in s.get("audio") or [] if a["file"] in index]
        mean = lambda k: (s.get(k) or {}).get("mean")  # noqa: E731
        species.append({
            "slug": s["slug"], "scientific_name": s["scientific_name"],
            "name": name, "name_alt": alt,
            "order": s.get("order"), "family": s.get("family"), "iucn": s.get("iucn"),
            "wingspan_cm": mean("wingspan_cm"), "mass_g": mean("mass_g"), "lifespan_y": mean("lifespan_y"),
            "zone_id": s.get("zone_id"), "place_id": s.get("place_id"), "last_seen": s.get("last_seen"),
            "photo": photo, "audio": audio,
            "links": {
                "wikipedia": wiki,
                "xeno_canto": "https://xeno-canto.org/species/" + s["scientific_name"].replace(" ", "-"),
                "wikidata": f"https://www.wikidata.org/wiki/{s['qid']}" if s.get("qid") else None,
            },
        })
    return {"park": park, "generated": datetime.now(timezone.utc).replace(microsecond=0).isoformat(), "species": species}


LICENSE_LINKS = {}


def attributions_md(attributions: list[dict]) -> str:
    lines = [
        "# Bronvermelding media",
        "",
        "Alle foto's en geluiden in Avifauna Ontdekker komen uit open bronnen en behouden hun eigen licentie.",
        "Dit bestand wordt automatisch gegenereerd door de datapijplijn (`pipeline/`); niet met de hand bewerken.",
        "Geluiden onder CC BY-NC-SA staan niet in de repository (kolom 'In repo') maar worden bij het bouwen opgehaald;",
        "bewerkte fragmenten houden dezelfde licentie als het origineel.",
        "",
        "| Bestand | Soort | Maker | Licentie | Bron | Bewerking | In repo |",
        "|---|---|---|---|---|---|---|",
    ]
    esc = lambda t: (t or "").replace("|", "\\|").replace("\n", " ")  # noqa: E731
    for a in sorted(attributions, key=lambda x: (x["slug"], x["kind"], x["file"])):
        lic = f"[{a['license']}]({a['license_url']})" if a.get("license_url") else a["license"]
        src = f"[{esc(a['title'])}]({a['source_url']}) ({a['source']})"
        lines.append(
            f"| `{a['file']}` | {a['slug']} | {esc(a['creator'])} | {lic} | {src} | {esc(a['modified'])} | {'ja' if a['in_repo'] else 'nee'} |"
        )
    return "\n".join(lines) + "\n"


def run(input_csv: Path, out: Path, media_dir: Path, steps: list[str], refresh: bool = False,
        park_json: Path | None = None, nc_dir: Path | None = None) -> dict:
    """Voer de gevraagde stappen uit. Zilver wordt hergebruikt als een stap wordt overgeslagen."""
    http = Http(refresh=refresh)
    silver_path, attr_path = out / "silver" / "species.json", out / "silver" / "attributions.json"
    species = read_species_csv(input_csv)
    silver = _read_json(silver_path)
    attributions = _read_json(attr_path, [])
    report: dict = {}

    if "wikidata" in steps or silver is None:
        silver = step_wikidata(http, species, out)
    if "photos" in steps:
        step_photos(http, silver, out, media_dir, attributions)
    if "audio" in steps:
        report["audio"] = step_audio(http, silver, out, media_dir, attributions, nc_dir)
    _write_json(silver_path, silver)
    _write_json(attr_path, attributions)

    if "gold" in steps:
        park = _read_json(park_json, {}) if park_json else {}
        for lang in ("nl", "en"):
            _write_json(out / "gold" / f"app-data.{lang}.json", build_gold(silver, attributions, park, lang))
        (out / "gold" / "ATTRIBUTIONS.md").write_text(attributions_md(attributions), encoding="utf-8")
    report["coverage"] = coverage_report(silver)
    return report


def coverage_report(silver: list[dict]) -> dict:
    n = len(silver)
    fields = ["qid", "label_nl", "label_en", "order", "family", "iucn", "wingspan_cm", "mass_g", "lifespan_y",
              "commons_category", "gbif_id", "wikipedia_nl", "wikipedia_en", "photo"]
    cov = wikidata.coverage(silver, fields)
    cov["audio"] = sum(1 for s in silver if s.get("audio"))
    cov["audio_in_repo"] = sum(1 for s in silver if s.get("audio") and s["audio"][0]["in_repo"])
    cov["audio_nc_cache"] = sum(1 for s in silver if s.get("audio") and not s["audio"][0]["in_repo"])
    return {
        "total": n, "fields": cov,
        "unmatched": [s["scientific_name"] for s in silver if s.get("match") == "none"],
        "search_matched": [(s["scientific_name"], s["matched_name"]) for s in silver if s.get("match") == "search"],
        "photo_rejected": {s["slug"]: s["photo_rejected"] for s in silver if s.get("photo_rejected")},
    }
