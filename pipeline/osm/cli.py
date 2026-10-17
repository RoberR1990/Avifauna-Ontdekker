from __future__ import annotations

import argparse
from pathlib import Path

DEFAULT_DIR = Path(__file__).resolve().parents[2] / "parks" / "avifauna" / "map"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="osm")
    ap.add_argument("cmd", choices=["fetch", "svg"])
    ap.add_argument("--dir", type=Path, default=DEFAULT_DIR)
    a = ap.parse_args(argv)
    if a.cmd == "fetch":
        from .fetch import fetch
        p = fetch(a.dir)
        print("geschreven:", p, p.stat().st_size, "bytes")
    else:
        from .svg import build
        for p in build(a.dir):
            print("geschreven:", p)
    return 0
