"""Eenheden normaliseren: lengte -> cm, massa -> g, tijd -> jaar.

Wikidata-eenheden zijn QID's. Onbekende eenheid => None (waarde wordt genegeerd, niet geraden).
"""
from __future__ import annotations

# factor naar cm
LENGTH_CM = {
    "Q11573": 100.0,  # meter
    "Q174728": 1.0,  # centimeter
    "Q174789": 0.1,  # millimeter
    "Q828224": 100000.0,  # kilometer
    "Q218593": 2.54,  # inch
    "Q3710": 30.48,  # foot
}
# factor naar g
MASS_G = {
    "Q11570": 1000.0,  # kilogram
    "Q41803": 1.0,  # gram
    "Q191118": 1_000_000.0,  # ton
    "Q100995": 453.59237,  # pound
    "Q48013": 28.349523125,  # ounce
    "Q21061369": 0.001,  # milligram
}
# factor naar jaar
TIME_Y = {
    "Q577": 1.0,  # jaar
    "Q24564698": 1.0,  # jaar (calendar)
    "Q5151": 1 / 12,  # maand
    "Q23387": 1 / 52.1775,  # week
    "Q573": 1 / 365.25,  # dag
    "Q11574": 1 / (365.25 * 86400),  # seconde
    "Q25235": 1 / (365.25 * 24),  # uur
    "Q1092296": 1.0,  # annum
}

TABLES = {"cm": LENGTH_CM, "g": MASS_G, "y": TIME_Y}


def unit_qid(uri: str | None) -> str | None:
    if not uri:
        return None
    return uri.rsplit("/", 1)[-1]


def normalise(amount: float, unit: str | None, target: str) -> float | None:
    """Zet amount in unit (QID of URI) om naar target ('cm', 'g' of 'y'). Onbekend => None."""
    q = unit_qid(unit)
    factor = TABLES[target].get(q) if q else None
    if factor is None:
        return None
    return float(amount) * factor


# plausibele grenzen om Wikidata-fouten (verkeerde eenheid) weg te filteren
PLAUSIBLE = {"cm": (3, 600), "g": (1, 200_000), "y": (0.1, 150)}


def aggregate(values: list[float], target: str) -> dict | None:
    """Gemiddelde (afgerond) + min/max/n van de geloofwaardige waarden. Geen waarden => None."""
    lo, hi = PLAUSIBLE[target]
    vals = [v for v in values if v is not None and lo <= v <= hi]
    if not vals:
        return None
    mean = sum(vals) / len(vals)
    nd = 1 if target in ("cm", "y") else 0
    return {"mean": round(mean, nd) if nd else int(round(mean)), "min": min(vals), "max": max(vals), "n": len(vals)}
