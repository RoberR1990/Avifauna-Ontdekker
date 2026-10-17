"""Referentielijst vogelsoorten (wetenschappelijk, NL, EN) uit Wikidata, met cache."""
from __future__ import annotations

import json
import time
from datetime import date
from pathlib import Path

from .paths import NAMES_CACHE, USER_AGENT

ENDPOINT = "https://query.wikidata.org/sparql"

# Strategie 1: alle taxa van rang 'soort' onder Aves (P171+). Werkt (ca. 70 s, ca. 23.000 rijen).
_Q_TRANSITIVE = """SELECT ?q ?sci ?nl ?en WHERE {
 ?item wdt:P225 ?sci; wdt:P105 wd:Q7432; wdt:P171+ wd:Q5113 .
 OPTIONAL{?item rdfs:label ?nl FILTER(lang(?nl)="nl")}
 OPTIONAL{?item rdfs:label ?en FILTER(lang(?en)="en")}
 BIND(STRAFTER(STR(?item),"entity/") AS ?q)
}"""

# Strategie 2 (terugval): soorten met een Avibase-ID (P2026), geen transitieve query nodig.
_Q_AVIBASE = """SELECT ?q ?sci ?nl ?en WHERE {
 ?item wdt:P225 ?sci; wdt:P105 wd:Q7432; wdt:P2026 [] .
 OPTIONAL{?item rdfs:label ?nl FILTER(lang(?nl)="nl")}
 OPTIONAL{?item rdfs:label ?en FILTER(lang(?en)="en")}
 BIND(STRAFTER(STR(?item),"entity/") AS ?q)
}"""


def _run(query: str, timeout: int = 180) -> list[dict]:
    import requests

    r = requests.post(
        ENDPOINT,
        data={"query": query},
        headers={"User-Agent": USER_AGENT, "Accept": "application/sparql-results+json"},
        timeout=timeout,
    )
    r.raise_for_status()
    return r.json()["results"]["bindings"]


def rows_to_entries(bindings: list[dict]) -> list[dict]:
    seen: dict[str, dict] = {}
    for b in bindings:
        sci = b["sci"]["value"].strip()
        if len(sci.split()) != 2:  # alleen binomialen (geen ondersoorten/hybriden)
            continue
        e = seen.setdefault(sci.lower(), {"sci": sci, "nl": None, "en": None, "qid": b["q"]["value"]})
        if b.get("nl") and not e["nl"]:
            e["nl"] = b["nl"]["value"]
        if b.get("en") and not e["en"]:
            e["en"] = b["en"]["value"]
    # labels zonder vertaling vallen terug op de wetenschappelijke naam: niet bruikbaar als naam
    for e in seen.values():
        for k in ("nl", "en"):
            if e[k] and e[k].lower() == e["sci"].lower():
                e[k] = None
    return sorted(seen.values(), key=lambda e: e["sci"])


def fetch_names() -> list[dict]:
    last: Exception | None = None
    for q in (_Q_TRANSITIVE, _Q_TRANSITIVE, _Q_AVIBASE, _Q_AVIBASE):  # 504's komen voor: opnieuw proberen
        try:
            entries = rows_to_entries(_run(q))
            if len(entries) > 5000:
                return entries
        except Exception as ex:  # time-out, 5xx, netwerk
            last = ex
            time.sleep(10)
    raise RuntimeError(f"Wikidata-query mislukt: {last}")


def load_names(cache: Path = NAMES_CACHE, refresh: bool = False) -> list[dict]:
    """Lees de cache; haal opnieuw op bij `refresh` of als die ontbreekt."""
    if cache.exists() and not refresh:
        return json.loads(cache.read_text(encoding="utf-8"))["species"]
    entries = fetch_names()
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(
        json.dumps({"fetched": date.today().isoformat(), "source": "Wikidata SPARQL (CC0)", "species": entries},
                   ensure_ascii=False),
        encoding="utf-8",
    )
    return entries
