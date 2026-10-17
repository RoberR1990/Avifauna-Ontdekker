"""CLI: python -m avipipe run --input soorten.csv --out data/proef --media-dir ../build-cache/proef/media"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

from .config import REPO_ROOT, load_env
from .pipeline import STEPS, run


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="avipipe", description="Avifauna Ontdekker datapijplijn (brons -> zilver -> goud)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run", help="voer de pijplijn uit")
    r.add_argument("--input", required=True, type=Path, help="CSV met minimaal scientific_name (optioneel name_nl, zone_id, ...)")
    r.add_argument("--out", required=True, type=Path, help="uitvoermap met bronze/, silver/, gold/")
    r.add_argument("--media-dir", required=True, type=Path, help="map voor foto's/audio (foto's -> <dir>/photos, repo-audio -> <dir>/audio)")
    r.add_argument("--nc-dir", type=Path, default=None, help="map voor BY-NC-SA-audio (standaard build-cache/audio in de repo-root)")
    r.add_argument("--park", type=Path, default=None, help="park.json voor het park-blok in goud (standaard parks/avifauna/park.json indien aanwezig)")
    r.add_argument("--steps", default=",".join(STEPS), help=f"kommagescheiden subset van {STEPS}")
    r.add_argument("--skip-audio", action="store_true")
    r.add_argument("--skip-photos", action="store_true")
    r.add_argument("--refresh", action="store_true", help="negeer de HTTP-cache")
    r.add_argument("-v", "--verbose", action="store_true")
    args = ap.parse_args(argv)

    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO, format="%(levelname)s %(message)s")
    load_env()
    steps = [s.strip() for s in args.steps.split(",") if s.strip()]
    bad = [s for s in steps if s not in STEPS]
    if bad:
        ap.error(f"onbekende stap(pen): {bad}")
    if args.skip_audio and "audio" in steps:
        steps.remove("audio")
    if args.skip_photos and "photos" in steps:
        steps.remove("photos")
    park = args.park
    if park is None and (REPO_ROOT / "parks" / "avifauna" / "park.json").exists():
        park = REPO_ROOT / "parks" / "avifauna" / "park.json"
    report = run(args.input, args.out, args.media_dir, steps, refresh=args.refresh, park_json=park, nc_dir=args.nc_dir)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
