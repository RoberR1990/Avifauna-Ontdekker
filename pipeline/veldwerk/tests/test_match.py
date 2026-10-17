import pytest

from veldwerk.match import Matcher, slugify


@pytest.fixture(scope="module")
def m(names):
    return Matcher(names)


def sci(res):
    return [r.sci for r in res]


def test_exact_latin(m):
    r = m.match_text("Humboldtpinguïn\nSpheniscus humboldti")
    assert sci(r) == ["Spheniscus humboldti"] and r[0].score >= 99


def test_fuzzy_ocr_digit_for_letter(m):
    r = m.match_text("Spheniscus humbo1dti")
    assert sci(r) == ["Spheniscus humboldti"] and r[0].score >= 90


def test_fuzzy_garbage_between_words_and_missing_letters(m):
    assert sci(m.match_text("Casuarius casuaris")) == ["Casuarius casuarius"]
    assert sci(m.match_text("| Phoenicopterus  chilensis |")) == ["Phoenicopterus chilensis"]
    assert sci(m.match_text("_ aliaeetus pelagicus _\nStellers zeearend")) == ["Haliaeetus pelagicus"]


def test_dutch_name_only(m):
    r = m.match_text("Oehoe\nroofvogel")
    assert sci(r) == ["Bubo bubo"] and r[0].via == "nl"
    assert r[0].score < 100  # alleen naam is minder zeker dan binomiaal


def test_dutch_name_accent_insensitive(m):
    assert sci(m.match_text("Humboldtpinguin")) == ["Spheniscus humboldti"]


def test_two_species_on_one_sign(m):
    r = m.match_text("Rode ibis\nEudocimus ruber\nOehoe\nBubo bubo")
    assert sci(r) == ["Eudocimus ruber", "Bubo bubo"]


def test_alternatives_listed(m):
    r = m.match_text("Phoenicopterus chilensis")
    assert r[0].alternatives and r[0].alternatives[0][0] == "Phoenicopterus roseus"


def test_no_match_on_unrelated_text(m):
    assert m.match_text("Toiletten\nuitgang rechts\nopen 10.00 - 17.00") == []
    assert m.match_text("") == []


def test_slugify():
    assert slugify("Spheniscus humboldti") == "spheniscus-humboldti"


def test_dutch_words_do_not_fuzzy_match_other_latin_names(m):
    # 'Rode ibis' lijkt qua tekens op 'Ardea ibis', maar geslacht en soort wijken beide af
    assert sci(m.match_text("Rode ibis")) == ["Eudocimus ruber"]
    assert "Ardea ibis" not in sci(m.match_text("Rode ibis\nEudocimus ruber"))
