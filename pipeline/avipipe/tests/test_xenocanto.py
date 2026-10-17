import pytest

from avipipe import xenocanto as xc

BY_SA = "https://creativecommons.org/licenses/by-sa/4.0/"
BY_NC_SA = "https://creativecommons.org/licenses/by-nc-sa/4.0/"


def rec(id, q="A", length="0:30", lic=BY_SA, type="song", uploaded="2024-01-01", file=True):
    return {
        "id": str(id), "gen": "Bubo", "sp": "bubo", "q": q, "length": length, "lic": lic, "type": type,
        "uploaded": uploaded, "rec": "Jan Jansen", "file": f"https://xeno-canto.org/{id}/download" if file else "",
    }


def test_parse_length():
    assert xc.parse_length("0:45") == 45
    assert xc.parse_length("1:02") == 62
    assert xc.parse_length("1:02:03") == 3723
    assert xc.parse_length("") is None and xc.parse_length("x") is None


def test_selection_filters():
    recs = [
        rec(1, q="C"),  # te lage kwaliteit
        rec(2, length="1:30"),  # te lang
        rec(3, lic="https://creativecommons.org/licenses/by-nc-nd/4.0/"),  # ND
        rec(4, lic="https://creativecommons.org/licenses/by-nc/4.0/"),  # NC zonder SA
        rec(5, lic="https://creativecommons.org/licenses/by/4.0/"),  # BY alleen
        rec(6, file=False),  # opname weg / beperkt
        rec(7),  # goed
    ]
    assert [r["id"] for r in xc.select_candidates(recs)] == ["7"]


def test_selection_order():
    recs = [
        rec(10, q="B", type="song"),
        rec(11, q="A", type="call", length="0:20"),
        rec(12, q="A", type="song", length="0:50"),
        rec(13, q="A", type="song", length="0:20", uploaded="2020-01-01"),
        rec(14, q="A", type="song", length="0:20", uploaded="2024-05-05"),
        rec(15, q="A", type="alarm", length="0:05"),
    ]
    # A eerst; dan song voor call voor rest; dan korter; dan recenter
    assert [r["id"] for r in xc.select_candidates(recs)] == ["14", "13", "12", "11", "15", "10"]


def test_nc_flag_and_spdx():
    c = xc.select_candidates([
        rec(1, lic=BY_NC_SA),
        rec(2, lic="https://creativecommons.org/publicdomain/zero/1.0/", q="B"),
    ])
    by = {r["id"]: r for r in c}
    assert by["1"]["_nc"] is True and by["1"]["_spdx"] == "CC-BY-NC-SA-4.0"
    assert by["2"]["_nc"] is False and by["2"]["_spdx"] == "CC0-1.0"


class FakeHttp:
    def get_bytes(self, url, params=None):
        return b"fake"


@pytest.fixture
def no_ffmpeg(monkeypatch):
    def fake_clips(ffmpeg, src, o, m):
        for p in (o, m):
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(b"x")
        return {"start": 1.0, "duration": 8.0}

    monkeypatch.setattr(xc, "make_clips", fake_clips)


def test_nc_routing(tmp_path, no_ffmpeg):
    media, nc = tmp_path / "media", tmp_path / "build-cache" / "audio"
    nc_rec = xc.select_candidates([rec(1, lic=BY_NC_SA)])[0]
    out = xc.build_audio(FakeHttp(), nc_rec, "bubo-bubo", "Bubo bubo", media, "ffmpeg", nc)
    assert all(a["in_repo"] is False and a["file"].startswith("build-cache/audio/") for a in out)
    assert (nc / "bubo-bubo.opus").exists() and not (media / "audio").exists()
    assert out[0]["license"] == "CC-BY-NC-SA-4.0" and out[0]["title"] == "XC1 Bubo bubo"
    assert out[0]["source_url"] == "https://xeno-canto.org/1" and out[0]["creator"] == "Jan Jansen"

    free = xc.select_candidates([rec(2)])[0]
    out = xc.build_audio(FakeHttp(), free, "bubo-bubo", "Bubo bubo", media, "ffmpeg", nc)
    assert all(a["in_repo"] is True and a["file"].startswith("media/audio/") for a in out)
    assert (media / "audio" / "bubo-bubo.opus").exists()


def test_missing_recording_does_not_fail(tmp_path, no_ffmpeg):
    class Boom(FakeHttp):
        def get_json(self, *a, **k):
            raise RuntimeError("HTTP 500 key=SECRET")

    assert xc.process_species(Boom(), "Bubo bubo", "bubo-bubo", tmp_path, "SECRET", "ffmpeg", {}) == []

    # zoeken lukt, download faalt voor de eerste, tweede slaagt
    class Flaky(FakeHttp):
        def get_json(self, *a, **k):
            return {"recordings": [rec(1), rec(2)]}

        def get_bytes(self, url, params=None):
            if "/1/" in url:
                raise RuntimeError("404 opname verwijderd")
            return b"ok"

    out = xc.process_species(Flaky(), "Bubo bubo", "bubo-bubo", tmp_path, "k", "ffmpeg", {}, tmp_path / "nc")
    assert out and out[0]["source_url"].endswith("/2")

    # niets bruikbaar
    class Empty(FakeHttp):
        def get_json(self, *a, **k):
            return {"recordings": []}

    assert xc.process_species(Empty(), "Bubo bubo", "bubo-bubo", tmp_path, "k", "ffmpeg", {}) == []


def test_energetic_start():
    import numpy as np

    sr = 1000
    x = np.zeros(30 * sr, dtype=np.float32)
    x[12 * sr : 20 * sr] = 0.5
    assert xc.energetic_start(x, sr) == pytest.approx(12.0, abs=0.3)
    assert xc.energetic_start(x[: 5 * sr], sr) == 0.0
