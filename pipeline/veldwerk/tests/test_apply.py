import csv
import json

from veldwerk.apply import apply_rows, read_check_csv, run_apply
from veldwerk.process import CHECK_COLS, write_check_csv


def row(**kw):
    base = {c: "" for c in CHECK_COLS}
    base.update(kw)
    return base


PENGUIN = dict(foto="a.jpg", tijd="2026-10-10 14:02:11", gps="52.143000, 4.681000", type="soort",
               wetenschappelijke_naam="Spheniscus humboldti", naam_nl="Humboldtpinguïn", score="100",
               plaats_id="verblijf-001", plaats_gps="52.143000, 4.681000")
EMU = dict(foto="b.jpg", tijd="2026-10-10 14:10:00", gps="52.1434, 4.6818", type="soort",
           wetenschappelijke_naam="Dromaius novaehollandiae", naam_nl="Emoe", score="95",
           plaats_id="verblijf-002", plaats_gps="52.143400, 4.681800")


def empty_places():
    return {"type": "FeatureCollection", "features": []}


def test_ok_confirms_and_creates_place():
    sp, pl, st = apply_rows([row(**PENGUIN, correctie="ok", plaatsnaam="Pinguïnverblijf")], [], empty_places())
    assert sp[0]["status"] == "confirmed" and sp[0]["slug"] == "spheniscus-humboldti"
    assert sp[0]["place_id"] == "verblijf-001" and sp[0]["last_seen"] == "2026-10-10"
    f = pl["features"][0]["properties"]
    assert f["name_nl"] == "Pinguïnverblijf" and f["source"] == "veldwerk" and f["kind"] == "enclosure"
    assert st["soorten_nieuw"] == 1 and st["plekken_nieuw"] == 1


def test_empty_correction_stays_draft_and_empty_unmatched_dropped():
    junk = row(foto="x.jpg", type="overig", plaats_id="verblijf-009", plaats_gps="52.1, 4.6")
    sp, pl, _ = apply_rows([row(**PENGUIN), junk], [], empty_places())
    assert [s["status"] for s in sp] == ["draft"]
    assert len(pl["features"]) == 1


def test_override_and_drop():
    rows = [row(**PENGUIN, correctie="spheniscus demersus"), row(**EMU, correctie="weg")]
    sp, pl, st = apply_rows(rows, [], empty_places())
    assert [(s["scientific_name"], s["status"]) for s in sp] == [("Spheniscus demersus", "confirmed")]
    assert st["genegeerd"] == 1 and len(pl["features"]) == 1


def test_existing_confirmed_not_clobbered_and_fills_empty():
    old = [{"scientific_name": "Spheniscus humboldti", "slug": "spheniscus-humboldti", "name_nl": "Pinguin",
            "zone_id": "", "place_id": "", "last_seen": "2025-01-01", "wikidata_qid": "Q1", "status": "confirmed", "notes": "handmatig"}]
    sp, _, st = apply_rows([row(**PENGUIN, correctie="ok")], old, empty_places())
    assert len(sp) == 1 and sp[0]["name_nl"] == "Pinguin" and sp[0]["last_seen"] == "2025-01-01"
    assert sp[0]["notes"] == "handmatig" and sp[0]["wikidata_qid"] == "Q1"
    assert sp[0]["place_id"] == "verblijf-001"  # lege velden mogen worden aangevuld
    assert st["soorten_behouden"] == 1


def test_existing_draft_replaced_other_species_kept():
    old = [{"scientific_name": "Spheniscus humboldti", "slug": "spheniscus-humboldti", "name_nl": "", "zone_id": "",
            "place_id": "", "last_seen": "", "wikidata_qid": "", "status": "draft", "notes": ""},
           {"scientific_name": "Zzz zzz", "slug": "zzz-zzz", "name_nl": "", "zone_id": "", "place_id": "",
            "last_seen": "", "wikidata_qid": "", "status": "confirmed", "notes": ""}]
    sp, _, st = apply_rows([row(**PENGUIN, correctie="ok")], old, empty_places())
    assert {s["slug"]: s["status"] for s in sp} == {"spheniscus-humboldti": "confirmed", "zzz-zzz": "confirmed"}
    assert st["soorten_bijgewerkt"] == 1


def test_existing_place_reused_new_id_does_not_collide():
    places = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"id": "verblijf-001", "kind": "enclosure", "name_nl": "Oud", "source": "manual"},
         "geometry": {"type": "Point", "coordinates": [4.68101, 52.14301]}}]}
    # PENGUIN ligt <12 m van bestaand verblijf-001 -> hergebruik; EMU is nieuw en moet verblijf-002 worden
    sp, pl, st = apply_rows([row(**PENGUIN, correctie="ok"), row(**EMU, correctie="ok")], [], places)
    ids = {f["properties"]["id"] for f in pl["features"]}
    assert ids == {"verblijf-001", "verblijf-002"} and st["plekken_hergebruikt"] == 1
    assert {s["slug"]: s["place_id"] for s in sp} == {"spheniscus-humboldti": "verblijf-001", "dromaius-novaehollandiae": "verblijf-002"}
    assert [f for f in pl["features"] if f["properties"]["id"] == "verblijf-001"][0]["properties"]["name_nl"] == "Oud"


def test_renumbering_when_concept_ids_clash_with_existing_other_place():
    places = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"id": "verblijf-001", "kind": "enclosure", "name_nl": "Elders", "source": "manual"},
         "geometry": {"type": "Point", "coordinates": [4.7, 52.2]}}]}
    sp, pl, _ = apply_rows([row(**PENGUIN, correctie="ok")], [], places)
    assert sp[0]["place_id"] == "verblijf-002" and len(pl["features"]) == 2


def test_facility_and_zone_assignment():
    zone = {"type": "Feature", "properties": {"id": "zone-a", "kind": "zone", "name_nl": "A"},
            "geometry": {"type": "Polygon", "coordinates": [[[4.68, 52.14], [4.69, 52.14], [4.69, 52.15], [4.68, 52.15], [4.68, 52.14]]]}}
    wc = row(foto="wc.jpg", tijd="2026-10-10 15:00:00", gps="52.1432, 4.6812", type="overig",
             plaats_id="verblijf-005", plaats_gps="52.1432, 4.6812", correctie="facility:toilet Toiletten hoofdgebouw")
    bad = row(foto="q.jpg", type="overig", plaats_gps="52.1, 4.6", correctie="facility:onzin")
    sp, pl, st = apply_rows([wc, bad, row(**PENGUIN, correctie="ok")], [], {"type": "FeatureCollection", "features": [zone]})
    fac = [f for f in pl["features"] if f["properties"]["kind"] == "facility"]
    assert len(fac) == 1 and fac[0]["properties"]["facility_type"] == "toilet" and fac[0]["properties"]["zone_id"] == "zone-a"
    assert fac[0]["properties"]["name_nl"] == "Toiletten hoofdgebouw"
    assert sp[0]["zone_id"] == "zone-a"


def test_roundtrip_csv_semicolon_and_comma(tmp_path):
    rows = [row(**PENGUIN, rij=1, correctie="ok")]
    p = tmp_path / "controlelijst.csv"
    write_check_csv(p, rows)
    assert read_check_csv(p)[0]["correctie"] == "ok"
    p2 = tmp_path / "komma.csv"
    with open(p2, "w", newline="", encoding="utf-8") as f:  # bv. opgeslagen door een andere spreadsheet
        w = csv.DictWriter(f, fieldnames=CHECK_COLS)
        w.writeheader()
        w.writerows(rows)
    assert read_check_csv(p2)[0]["wetenschappelijke_naam"] == "Spheniscus humboldti"


def test_run_apply_writes_files(tmp_path):
    park = tmp_path / "park"
    park.mkdir()
    csvp = tmp_path / "c.csv"
    write_check_csv(csvp, [row(**PENGUIN, correctie="ok")])
    run_apply(csvp, park)
    assert (park / "species.csv").read_text(encoding="utf-8").startswith("scientific_name,slug,name_nl")
    assert json.loads((park / "places.geojson").read_text(encoding="utf-8"))["features"]
    run_apply(csvp, park)  # tweede keer: idempotent
    assert len(list(csv.DictReader(open(park / "species.csv", encoding="utf-8")))) == 1
    assert len(json.loads((park / "places.geojson").read_text(encoding="utf-8"))["features"]) == 1
