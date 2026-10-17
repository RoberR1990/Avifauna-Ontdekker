"""Opdrachtregel: python -m veldwerk [run|apply|names|tessdata]  (vanuit pipeline/)."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from . import paths


def _out(s: str) -> None:
    print(s, flush=True)


def cmd_run(a) -> int:
    from . import process, report
    from .names import load_names
    from .tessdata import setup_tesseract

    folder = Path(a.input)
    if not folder.exists():
        _out(f"Map {folder} bestaat niet. Zet de foto's daar neer (zie pipeline/veldwerk/README.md).")
        return 1
    out = Path(a.output) if a.output else folder / "uitvoer"
    out.mkdir(parents=True, exist_ok=True)
    run_ocr = not a.no_ocr
    if run_ocr and not setup_tesseract():
        _out("Tesseract of taaldata ontbreekt; OCR wordt overgeslagen (alleen EXIF en plekken).")
        run_ocr = False
    _out("Soortenlijst laden (eerste keer ophalen uit Wikidata duurt ca. 1-2 minuten)...")
    names = load_names(Path(a.names) if a.names else paths.NAMES_CACHE, refresh=a.refresh_names)
    _out(f"  {len(names)} soorten in referentielijst")
    park_places = Path(a.places) if a.places else paths.PARK_DIR / "places.geojson"
    res = process.process_folder(folder, names, park_places, out / "ocr-cache.json", a.workers, run_ocr, _out)
    notes_raw, _ = process.read_notes(folder)

    process.write_species_csv(out / "concept-species.csv", process.concept_species(res))
    process.write_geojson(out / "concept-places.geojson", process.concept_places(res))
    process.write_check_csv(out / "controlelijst.csv", process.check_rows(res))
    report.write_html(out / "controlelijst.html", res, notes_raw)
    _out(
        f"Klaar: {len(res.photos)} foto's, {len(res.species_slugs())} soorten, {len(res.places)} plekken, "
        f"{process.attention_count(res)} foto's vragen aandacht.\nOpen: {out / 'controlelijst.html'}"
    )
    return 0


def cmd_apply(a) -> int:
    from .apply import run_apply
    from .names import load_names

    csv_path = Path(a.csv) if a.csv else paths.UITVOER_DIR / "controlelijst.csv"
    if not csv_path.exists():
        _out(f"{csv_path} bestaat niet. Draai eerst: python -m veldwerk run")
        return 1
    names = None
    if paths.NAMES_CACHE.exists():
        names = load_names()
    stats = run_apply(csv_path, Path(a.park) if a.park else paths.PARK_DIR, names)
    _out("Samengevoegd in parks/avifauna: " + ", ".join(f"{k}={v}" for k, v in stats.items()))
    return 0


def cmd_names(a) -> int:
    from .names import load_names

    n = load_names(refresh=True)
    _out(f"{len(n)} soorten opgeslagen in {paths.NAMES_CACHE}")
    return 0


def cmd_tessdata(a) -> int:
    from .tessdata import ensure_language

    for lang in ("nld", "eng", "osd"):
        _out(f"{ensure_language(lang)}")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="veldwerk", description="Veldwerkfoto's verwerken tot concept-soortenlijst en plekken.")
    sub = ap.add_subparsers(dest="cmd")
    r = sub.add_parser("run", help="foto's verwerken en controlelijst maken (standaard)")
    r.add_argument("--input", default=str(paths.VELDWERK_DIR), help="map met foto's (standaard: veldwerk/)")
    r.add_argument("--output", help="uitvoermap (standaard: <input>/uitvoer)")
    r.add_argument("--names", help="eigen referentielijst bird-names.json (standaard: cache)")
    r.add_argument("--places", help="places.geojson voor zones (standaard: parks/avifauna/places.geojson)")
    r.add_argument("--refresh-names", action="store_true", help="soortenlijst opnieuw uit Wikidata halen")
    r.add_argument("--no-ocr", action="store_true", help="alleen EXIF en plekken, geen tekstherkenning")
    r.add_argument("--workers", type=int, default=4, help="parallelle OCR-processen")
    r.set_defaults(fn=cmd_run)
    ap_ = sub.add_parser("apply", help="gecorrigeerde controlelijst.csv samenvoegen in parks/avifauna/")
    ap_.add_argument("--csv", help="controlelijst.csv (standaard: veldwerk/uitvoer/controlelijst.csv)")
    ap_.add_argument("--park", help="parkmap (standaard: parks/avifauna)")
    ap_.set_defaults(fn=cmd_apply)
    n = sub.add_parser("names", help="soortenlijst uit Wikidata vernieuwen")
    n.set_defaults(fn=cmd_names)
    t = sub.add_parser("tessdata", help="Nederlandse OCR-taaldata downloaden")
    t.set_defaults(fn=cmd_tessdata)

    args = ap.parse_args(argv)
    if not args.cmd:
        args = ap.parse_args(["run"] + (argv or []))
    return args.fn(args)
