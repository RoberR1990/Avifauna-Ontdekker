import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator
from shapely.geometry import shape

from osm.places import build_places, species_places

ROOT = Path(__file__).resolve().parents[3]
MAP = ROOT / "parks" / "avifauna" / "map"
SCHEMA = json.loads((ROOT / "parks" / "schema" / "places.schema.json").read_text(encoding="utf-8"))
EXTRACT = MAP / "osm-extract.json"

pytestmark = pytest.mark.skipif(not EXTRACT.exists(), reason="osm-extract.json ontbreekt")


@pytest.fixture(scope="module")
def fc():
    return build_places(json.loads(EXTRACT.read_text(encoding="utf-8")))


def _props(fc, kind=None):
    return [f["properties"] for f in fc["features"] if kind is None or f["properties"]["kind"] == kind]


def test_valid_against_schema(fc):
    errs = list(Draft202012Validator(SCHEMA).iter_errors(fc))
    assert not errs, errs[:3]


def test_committed_file_valid_and_matches():
    p = ROOT / "parks" / "avifauna" / "places.geojson"
    committed = json.loads(p.read_text(encoding="utf-8"))
    assert not list(Draft202012Validator(SCHEMA).iter_errors(committed))
    assert committed == build_places(json.loads(EXTRACT.read_text(encoding="utf-8")))


def test_ids_unique(fc):
    ids = [p["id"] for p in _props(fc)]
    assert len(ids) == len(set(ids))


def test_zone_refs_exist(fc):
    zones = {p["id"] for p in _props(fc, "zone")}
    for p in _props(fc):
        if "zone_id" in p:
            assert p["zone_id"] in zones


def test_zones_do_not_overlap_and_inside_park(fc):
    zs = [(f["properties"]["id"], shape(f["geometry"])) for f in fc["features"] if f["properties"]["kind"] == "zone"]
    assert 6 <= len(zs) <= 9
    deg2_per_m2 = 1 / (111_195 * 111_195 * 0.6137)  # ~ graad^2 per m^2
    for i, (ia, a) in enumerate(zs):
        assert a.is_valid and a.geom_type == "Polygon"
        for ib, b in zs[i + 1:]:
            assert a.intersection(b).area < 1.0 * deg2_per_m2, (ia, ib)


def test_counts(fc):
    n = {k: len(_props(fc, k)) for k in ("zone", "enclosure", "facility", "anchor")}
    assert n["enclosure"] == 17  # 18 OSM-attractiepunten, Vogeldemonstratie is facility (show)
    assert n["facility"] >= 8 and n["zone"] >= 6


def test_species_places_reference_existing(fc):
    ids = {p["id"] for p in _props(fc)}
    rows = species_places(fc)
    assert len(rows) == 21
    for r in rows:
        assert r["slug"] == r["scientific_name"].lower().replace(" ", "-")
        for col in ("place_id", "zone_id"):
            assert not r[col] or r[col] in ids
