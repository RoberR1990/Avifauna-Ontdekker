from datetime import datetime
from fractions import Fraction
from pathlib import Path

import pytest
from PIL import Image
from PIL.TiffImagePlugin import IFDRational

from veldwerk.exif import dms_to_deg, find_photos, parse_exif_datetime, read_meta
from veldwerk.tests.make_fixtures import exif_bytes

FIX = Path(__file__).parent / "fixtures"


def test_dms_tuples_north_east():
    assert dms_to_deg(((52, 1), (8, 1), (3600, 100)), "N") == pytest.approx(52 + 8 / 60 + 36 / 3600)


def test_dms_ifdrational_and_bytes_ref():
    v = (IFDRational(4, 1), IFDRational(40, 1), IFDRational(5000, 100))
    assert dms_to_deg(v, b"E") == pytest.approx(4 + 40 / 60 + 50 / 3600)


def test_dms_south_west_negative():
    assert dms_to_deg((33.0, 51.0, 54.0), "S") < 0
    assert dms_to_deg(((70, 1), (0, 1), (0, 1)), "W") == -70.0
    assert dms_to_deg(((70, 1), (0, 1), (0, 1)), b"W") == -70.0


def test_dms_fractions_floats_and_garbage():
    assert dms_to_deg((Fraction(10), Fraction(30), Fraction(0)), "N") == pytest.approx(10.5)
    assert dms_to_deg(None, "N") is None
    assert dms_to_deg(((1, 0), (0, 1), (0, 1)), "N") is not None  # noemer 0 crasht niet


def test_parse_datetime():
    assert parse_exif_datetime("2026:10:10 14:02:11") == datetime(2026, 10, 10, 14, 2, 11)
    assert parse_exif_datetime(b"2026:10:10 14:02:11") == datetime(2026, 10, 10, 14, 2, 11)
    assert parse_exif_datetime("0000:00:00 00:00:00") is None
    assert parse_exif_datetime(None) is None


def test_southern_western_hemisphere_roundtrip(tmp_path):
    p = tmp_path / "a.jpg"
    Image.new("RGB", (20, 10)).save(p, "JPEG", exif=exif_bytes(-33.8568, -70.1234, "2026:01:02 03:04:05", alt=12, acc=4))
    m = read_meta(p)
    assert m.lat == pytest.approx(-33.8568, abs=1e-4)
    assert m.lon == pytest.approx(-70.1234, abs=1e-4)
    assert m.altitude_m == pytest.approx(12)
    assert m.accuracy_m == pytest.approx(4)
    assert m.taken == datetime(2026, 1, 2, 3, 4, 5)
    assert m.offset == "+02:00"


def test_no_gps_is_flagged_not_dropped(tmp_path):
    p = tmp_path / "b.jpg"
    Image.new("RGB", (20, 10)).save(p, "JPEG", exif=exif_bytes(when="2026:01:02 03:04:05"))
    m = read_meta(p)
    assert not m.has_gps and m.taken is not None
    plain = tmp_path / "c.png"
    Image.new("RGB", (5, 5)).save(plain)
    assert not read_meta(plain).has_gps


def test_fixtures_gps_orientation_heic():
    jpg = read_meta(FIX / "01-pinguin.jpg")
    assert (jpg.lat, jpg.lon) == (pytest.approx(52.143, abs=1e-5), pytest.approx(4.681, abs=1e-5))
    assert read_meta(FIX / "03-kasuaris-staand.jpg").orientation == 6
    heic = read_meta(FIX / "05-zeearend.heic")
    assert heic.has_gps and heic.lat == pytest.approx(52.144, abs=1e-4)
    assert not read_meta(FIX / "02-binnen-zonder-gps.jpg").has_gps


def test_find_photos_skips_uitvoer(tmp_path):
    (tmp_path / "uitvoer").mkdir()
    Image.new("RGB", (4, 4)).save(tmp_path / "x.jpg")
    Image.new("RGB", (4, 4)).save(tmp_path / "uitvoer" / "y.jpg")
    (tmp_path / "notities.txt").write_text("hoi")
    assert [p.name for p in find_photos(tmp_path)] == ["x.jpg"]
