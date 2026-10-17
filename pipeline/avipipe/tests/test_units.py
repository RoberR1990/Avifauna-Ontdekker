import pytest

from avipipe import units

W = "http://www.wikidata.org/entity/"


def test_length():
    assert units.normalise(1.7, W + "Q11573", "cm") == pytest.approx(170)
    assert units.normalise(170, "Q174728", "cm") == 170
    assert units.normalise(1700, "Q174789", "cm") == pytest.approx(170)
    assert units.normalise(10, "Q218593", "cm") == pytest.approx(25.4)


def test_mass():
    assert units.normalise(1.8, W + "Q11570", "g") == pytest.approx(1800)
    assert units.normalise(2, "Q100995", "g") == pytest.approx(907.18474)


def test_years():
    assert units.normalise(24, "Q5151", "y") == pytest.approx(2)
    assert units.normalise(30, "Q577", "y") == 30


def test_unknown_unit_is_none():
    assert units.normalise(5, "Q999999999", "cm") is None
    assert units.normalise(5, None, "g") is None


def test_aggregate_mean_and_outliers():
    agg = units.aggregate([160.0, 180.0, 99999.0], "cm")  # buitenwaarde valt weg
    assert agg == {"mean": 170.0, "min": 160.0, "max": 180.0, "n": 2}
    assert units.aggregate([], "g") is None
    assert units.aggregate([None], "g") is None
