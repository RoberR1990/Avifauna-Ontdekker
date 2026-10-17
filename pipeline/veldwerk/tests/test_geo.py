import json
from datetime import datetime, timedelta
from pathlib import Path

import pytest

from veldwerk.exif import PhotoMeta
from veldwerk.geo import cluster_photos, estimate_positions, haversine_m, load_zones, sort_photos, zone_for

T0 = datetime(2026, 10, 10, 14, 0, 0)


def ph(name, minutes, lat=None, lon=None):
    return PhotoMeta(Path(name), lat=lat, lon=lon, taken=T0 + timedelta(minutes=minutes))


def test_haversine_known():
    # 0.001 graad breedte = ca. 111 m
    assert haversine_m(52.0, 4.0, 52.001, 4.0) == pytest.approx(111.2, abs=0.5)
    assert haversine_m(52, 4, 52, 4) == 0


def test_cluster_by_distance_and_time():
    photos = sort_photos([
        ph("a", 0, 52.14300, 4.68100),
        ph("b", 1, 52.14303, 4.68102),   # ca. 4 m
        ph("c", 2, 52.14400, 4.68100),   # ca. 110 m
        ph("d", 3, 52.14401, 4.68101),
        ph("e", 90, 52.14401, 4.68101),  # zelfde plek, maar lange pauze
    ])
    cl = cluster_photos(photos)
    assert [c.members for c in cl] == [[0, 1], [2, 3], [4]]
    assert cl[0].lat == pytest.approx(52.143015, abs=1e-6)


def test_photos_without_gps_never_form_clusters():
    photos = sort_photos([ph("a", 0), ph("b", 1)])
    assert cluster_photos(photos) == []


def test_indoor_interpolation_and_cluster_membership():
    photos = sort_photos([
        ph("a", 0, 52.1430, 4.6810),
        ph("b", 5),
        ph("c", 10, 52.1440, 4.6830),
    ])
    estimate_positions(photos)
    b = photos[1]
    assert b.pos_estimated and b.lat == pytest.approx(52.1435) and b.lon == pytest.approx(4.6820)
    cl = cluster_photos(photos)
    assert 1 in cl[0].members and len(cl) == 2  # binnenfoto hoort bij de ankerfoto ervoor


def test_no_estimate_when_anchors_too_far_apart_in_time():
    photos = sort_photos([ph("a", 0, 52.1, 4.6), ph("b", 20), ph("c", 40, 52.2, 4.7)])
    estimate_positions(photos)
    assert not photos[1].has_gps and not photos[1].pos_estimated


def test_no_estimate_without_neighbours():
    photos = sort_photos([ph("b", 0), ph("c", 1, 52.2, 4.7)])
    estimate_positions(photos)
    assert not photos[0].has_gps


def test_zones_point_in_polygon(tmp_path):
    g = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"id": "zone-test", "kind": "zone", "name_nl": "T"},
         "geometry": {"type": "Polygon", "coordinates": [[[4.68, 52.142], [4.682, 52.142], [4.682, 52.144], [4.68, 52.144], [4.68, 52.142]]]}},
        {"type": "Feature", "properties": {"id": "verblijf-x", "kind": "enclosure", "name_nl": "V"},
         "geometry": {"type": "Point", "coordinates": [4.681, 52.143]}}]}
    f = tmp_path / "places.geojson"
    f.write_text(json.dumps(g))
    zones = load_zones(f)
    assert len(zones) == 1
    assert zone_for(zones, 52.143, 4.681) == "zone-test"
    assert zone_for(zones, 52.2, 4.681) == ""
    assert load_zones(tmp_path / "nope.geojson") == []
