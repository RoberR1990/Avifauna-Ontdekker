import json

from avipipe import commons
from avipipe.pipeline import attributions_md, build_gold, read_species_csv

SPECIES_KEYS = {
    "slug", "scientific_name", "name", "name_alt", "order", "family", "iucn", "wingspan_cm", "mass_g",
    "lifespan_y", "zone_id", "place_id", "last_seen", "photo", "audio", "links",
}

ATTR = {
    "file": "media/photos/bubo-bubo.webp", "slug": "bubo-bubo", "kind": "photo", "source": "wikimedia-commons",
    "source_url": "https://commons.wikimedia.org/wiki/File:X.jpg", "creator": "A | B", "license": "CC-BY-4.0",
    "license_url": "https://creativecommons.org/licenses/by/4.0/", "title": "X.jpg", "retrieved": "2026-10-17",
    "modified": "resized", "in_repo": True,
}


def silver(**kw):
    s = {
        "slug": "bubo-bubo", "scientific_name": "Bubo bubo", "name_nl": "Europese oehoe", "label_nl": "oehoe",
        "label_en": "Eurasian eagle-owl", "qid": "Q130933", "order": "Strigiformes", "family": "Strigidae",
        "iucn": "LC", "wingspan_cm": {"mean": 174.0}, "mass_g": {"mean": 1817}, "lifespan_y": None,
        "zone_id": None, "place_id": None, "last_seen": None,
        "wikipedia_nl": "https://nl.wikipedia.org/wiki/Oehoe", "wikipedia_en": None,
        "photo": {"file": ATTR["file"]}, "audio": [],
    }
    s.update(kw)
    return s


def test_gold_shape_and_nulls():
    g = build_gold([silver()], [ATTR], {"name": "Avifauna Ontdekker"}, "nl")
    assert set(g) == {"park", "generated", "species"}
    sp = g["species"][0]
    assert set(sp) == SPECIES_KEYS
    assert set(sp["links"]) == {"wikipedia", "xeno_canto", "wikidata"}
    assert sp["name"] == "Europese oehoe" and sp["name_alt"] == "Eurasian eagle-owl"
    assert sp["lifespan_y"] is None and sp["audio"] == []
    assert sp["photo"] == {"file": ATTR["file"], "attribution_index": 0}
    json.dumps(g)


def test_gold_english_and_minimal_record():
    g = build_gold([silver()], [ATTR], {}, "en")
    assert g["species"][0]["name"] == "Eurasian eagle-owl"
    assert g["species"][0]["name_alt"] == "Europese oehoe"
    # soort zonder enige data: alle sleutels aanwezig, waarden null/leeg
    bare = {"slug": "x-y", "scientific_name": "X y"}
    sp = build_gold([bare], [], {}, "nl")["species"][0]
    assert set(sp) == SPECIES_KEYS and sp["name"] == "X y" and sp["name_alt"] is None
    assert sp["photo"] is None and sp["order"] is None and sp["links"]["wikidata"] is None


def test_attributions_md():
    md = attributions_md([ATTR])
    assert md.startswith("# Bronvermelding media")
    assert "CC-BY-4.0" in md and "A \\| B" in md and "| ja |" in md


def test_read_species_csv(tmp_path):
    p = tmp_path / "s.csv"
    p.write_text("scientific_name,name_nl\nBubo bubo,Oehoe\n,leeg\n", encoding="utf-8")
    rows = read_species_csv(p)
    assert len(rows) == 1 and rows[0]["slug"] == "bubo-bubo" and rows[0]["zone_id"] is None


def _ii(short, key):
    return {
        "mime": "image/jpeg", "thumburl": "http://t", "descriptionurl": "http://d",
        "extmetadata": {
            "LicenseShortName": {"value": short}, "License": {"value": key},
            "Artist": {"value": '<a href="x">Jan <b>Jansen</b></a>'},
        },
    }


def test_commons_evaluate():
    ok, why = commons.evaluate("File:A.jpg", _ii("CC BY-SA 4.0", "cc-by-sa-4.0"))
    assert why is None and ok["license"] == "CC-BY-SA-4.0" and ok["creator"] == "Jan Jansen"
    assert commons.evaluate("File:B.jpg", _ii("CC BY-NC 2.0", "cc-by-nc-2.0"))[0] is None
    svg = _ii("CC0", "cc0")
    svg["mime"] = "image/svg+xml"
    assert commons.evaluate("File:C.svg", svg)[0] is None
    url = "http://commons.wikimedia.org/wiki/Special:FilePath/Bubo%20bubo_1.jpg"
    assert commons.file_title_from_p18(url) == "File:Bubo bubo 1.jpg"


def test_gold_nulls_large_spread():
    from avipipe.pipeline import spread_report, spread_too_large

    wild = {"mean": 1036, "min": 94.0, "max": 1977.0, "n": 2}
    assert spread_too_large(wild)
    assert not spread_too_large({"mean": 100, "min": 80.0, "max": 200.0, "n": 2})  # precies 2,5 mag
    assert not spread_too_large({"mean": 5, "min": 5.0, "max": 5.0, "n": 1})
    s = silver(mass_g=wild)
    sp = build_gold([s], [ATTR], {}, "nl")["species"][0]
    assert sp["mass_g"] is None and sp["wingspan_cm"] == 174.0
    assert spread_report([s]) == [{"slug": "bubo-bubo", "field": "mass_g", "min": 94.0, "max": 1977.0}]


def test_publish_copies_only_in_repo(tmp_path):
    from avipipe.pipeline import publish

    out, media, park = tmp_path / "out", tmp_path / "media", tmp_path / "park"
    (out / "gold").mkdir(parents=True)
    for lang in ("nl", "en"):
        (out / "gold" / f"app-data.{lang}.json").write_text("{}", encoding="utf-8")
    (media / "photos").mkdir(parents=True)
    (media / "photos" / "bubo-bubo.webp").write_bytes(b"x")
    nc = {**ATTR, "file": "build-cache/audio/bubo-bubo.opus", "kind": "audio", "in_repo": False}
    rep = publish(out, media, park, [], [ATTR, nc])
    assert (park / "data" / "app-data.nl.json").exists()
    assert (park / "media" / "photos" / "bubo-bubo.webp").exists()
    assert not (park / "build-cache").exists() and not (park / "media" / "audio").exists()
    assert rep["copied_files"] == 1 and rep["attributions"] == 2
    assert json.loads((park / "media" / "attributions.json").read_text(encoding="utf-8"))[1]["in_repo"] is False
