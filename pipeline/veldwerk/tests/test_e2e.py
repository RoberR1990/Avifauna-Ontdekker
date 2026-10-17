import shutil
from pathlib import Path

import pytest

from veldwerk import process, report
from veldwerk.tessdata import setup_tesseract

FIX = Path(__file__).parent / "fixtures"
EXPECTED = {"spheniscus-humboldti", "casuarius-casuarius", "phoenicopterus-chilensis",
            "haliaeetus-pelagicus", "eudocimus-ruber", "bubo-bubo"}


@pytest.fixture(scope="module")
def result(names, tmp_path_factory):
    if not setup_tesseract(download=False):
        pytest.skip("tesseract (of taaldata) niet beschikbaar")
    out = tmp_path_factory.mktemp("uitvoer")
    photos = tmp_path_factory.mktemp("fotos")
    for f in FIX.glob("0*"):
        shutil.copy(f, photos / f.name)
    res = process.process_folder(photos, names, None, out / "ocr-cache.json", workers=4, log=lambda *_: None)
    return res, out


def test_species_found(result):
    res, _ = result
    found = res.species_slugs()
    assert len(found & EXPECTED) >= 5, found
    assert not found - EXPECTED


def test_structure_and_flags(result):
    res, _ = result
    by = {p.meta.path.name: p for p in res.photos}
    assert len(res.photos) == 8
    assert "binnen, positie geschat" in by["02-binnen-zonder-gps.jpg"].flags
    assert by["02-binnen-zonder-gps.jpg"].cluster == by["01-pinguin.jpg"].cluster
    assert len(by["06-twee-soorten.jpg"].matches) == 2
    assert by["08-verblijf-zonder-bord.jpg"].kind == "overig"
    assert by["07-onleesbaar.jpg"].matches == []
    assert [p.meta.taken for p in res.photos] == sorted(p.meta.taken for p in res.photos)


def test_outputs_written(result):
    res, out = result
    sp = process.concept_species(res)
    assert all(r["status"] == "draft" and r["last_seen"] == "2026-10-10" for r in sp)
    gj = process.concept_places(res)
    assert gj["features"][0]["properties"]["id"] == "verblijf-001"
    assert all(f["properties"]["source"] == "veldwerk" and f["properties"]["kind"] == "enclosure" for f in gj["features"])
    rows = process.check_rows(res)
    process.write_check_csv(out / "controlelijst.csv", rows)
    report.write_html(out / "controlelijst.html", res)
    html = (out / "controlelijst.html").read_text(encoding="utf-8")
    assert "data:image/jpeg;base64," in html and "openstreetmap.org" in html and "Spheniscus humboldti" in html
    with open(out / "controlelijst.csv", encoding="utf-8-sig") as f:
        header = f.readline()
    assert "correctie" in header and header.count(";") > 10
