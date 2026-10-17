import json
import math
from pathlib import Path

from osm.classify import classify, path_kind
from osm.geo import Projection, apply_affine, invert_affine, solve_affine
from osm.svg import stitch

FIX = json.loads((Path(__file__).parent / "fixture.json").read_text(encoding="utf-8"))


def test_projection_roundtrip():
    p = Projection(52.139, 4.649, 2.3, 500, 600)
    for lat, lon in [(52.1372, 4.6463), (52.1414, 4.6518), (52.139, 4.649)]:
        x, y = p.to_xy(lat, lon)
        la, lo = p.to_latlon(x, y)
        assert abs(la - lat) < 1e-9 and abs(lo - lon) < 1e-9


def test_north_up_and_metric_scale():
    p = Projection(52.139, 4.649, 1.0, 0, 0)
    x1, y1 = p.to_xy(52.140, 4.649)
    assert y1 < 0  # noorden = kleinere y
    assert abs(-y1 - 111.2) < 0.5  # 0.001 graad ~ 111 m
    x2, _ = p.to_xy(52.139, 4.650)
    assert abs(x2 - 111.2 * math.cos(math.radians(52.139))) < 0.5


def test_affine_matches_projection_and_inverts():
    p = Projection(52.139, 4.649, 2.3, 500, 617)
    t = p.affine()
    for lat, lon in [(52.1372, 4.6463), (52.1414, 4.6518)]:
        assert max(abs(a - b) for a, b in zip(apply_affine(t, lat, lon), p.to_xy(lat, lon))) < 1e-6
        x, y = apply_affine(t, lat, lon)
        la, lo = invert_affine(t, x, y)
        assert abs(la - lat) < 1e-9 and abs(lo - lon) < 1e-9


def test_three_control_points_solve():
    p = Projection(52.139, 4.649, 2.3, 500, 617)
    cps = []
    for lat, lon in [(52.1414, 4.6463), (52.1414, 4.6518), (52.1372, 4.6463)]:
        x, y = p.to_xy(lat, lon)
        cps.append({"lat": lat, "lon": lon, "x": x, "y": y})
    t = solve_affine(cps)
    x, y = apply_affine(t, 52.140, 4.650)
    ex, ey = p.to_xy(52.140, 4.650)
    assert math.hypot(x - ex, y - ey) < 0.01  # < 1 px


def test_classification():
    got = {e["id"]: classify(e) for e in FIX["elements"]}
    assert got == {1: "boundary", 2: "buildings", 3: "water", 4: "paths", 5: "fences", 6: "green",
                   7: "pois", 8: "pois", 9: "trees", 10: None, 11: "green", 12: "pois"}


def test_path_kind():
    assert path_kind({"highway": "service"}) == "road"
    assert path_kind({"highway": "footway"}) == "footway"
    assert path_kind({"highway": "steps"}) == "steps"


def test_stitch_rings():
    a = [(0, 0), (0, 1), (1, 1)]
    b = [(1, 1), (1, 0), (0, 0)]
    rings = stitch([a, b])
    assert len(rings) == 1 and rings[0][0] == rings[0][-1]
