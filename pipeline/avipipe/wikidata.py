"""Wikidata (SPARQL): soort -> QID en velden. CC0.

Stap 1: wetenschappelijke naam (P225) -> QID (met zoekfallback via wbsearchentities).
Stap 2: velden per QID in batches met VALUES.

Meerwaardige velden (spanwijdte, gewicht, levensduur, vaak met geslacht als kwalificatie):
we zetten alles om naar cm / g / jaar, filteren onwaarschijnlijke waarden en bewaren
het GEMIDDELDE (plus min/max/n in zilver). Gedeprecieerde statements worden genegeerd.
"""
from __future__ import annotations

import logging

from . import units
from .http import Http

log = logging.getLogger("avipipe")

SPARQL = "https://query.wikidata.org/sparql"
WDAPI = "https://www.wikidata.org/w/api.php"
BATCH = 25

IUCN_QID = {
    "Q211005": "LC", "Q719675": "NT", "Q278113": "VU", "Q11394": "EN",
    "Q219127": "CR", "Q239509": "EW", "Q237350": "EX", "Q3245245": "DD", "Q3350324": "NE",
}
IUCN_SEVERITY = ["EX", "EW", "CR", "EN", "VU", "NT", "LC", "DD", "NE"]

QUANTITY_PROPS = {"P2050": "cm", "P2067": "g", "P2250": "y"}
RANK_ORDER = "Q36602"
RANK_FAMILY = "Q35409"


def _esc(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"')


def _chunks(seq, n):
    for i in range(0, len(seq), n):
        yield seq[i : i + n]


def run_sparql(http: Http, query: str) -> list[dict]:
    obj = http.get_json(
        SPARQL,
        method="POST",
        data={"query": query, "format": "json"},
        headers={"Accept": "application/sparql-results+json"},
    )
    return obj["results"]["bindings"]


def _val(b: dict, k: str):
    return b[k]["value"] if k in b else None


def _qid(uri: str | None) -> str | None:
    return uri.rsplit("/", 1)[-1] if uri else None


# ------------------------------------------------------------------ stap 1


def resolve_names(http: Http, names: list[str], bronze: dict) -> dict[str, dict]:
    """Geef {naam: {qid, match, matched_name}}. match: exact | search | none."""
    out: dict[str, dict] = {}
    for chunk in _chunks(names, BATCH):
        values = " ".join(f'"{_esc(n)}"' for n in chunk)
        q = f"""SELECT ?name ?item (COUNT(DISTINCT ?sl) AS ?n) WHERE {{
  VALUES ?name {{ {values} }}
  ?item wdt:P225 ?name .
  OPTIONAL {{ ?sl schema:about ?item . }}
}} GROUP BY ?name ?item"""
        rows = run_sparql(http, q)
        bronze.setdefault("resolve", []).extend(rows)
        best: dict[str, tuple[int, str]] = {}
        for r in rows:
            n = int(_val(r, "n") or 0)
            name, qid = _val(r, "name"), _qid(_val(r, "item"))
            if name not in best or n > best[name][0]:
                best[name] = (n, qid)
        for name in chunk:
            if name in best:
                out[name] = {"qid": best[name][1], "match": "exact", "matched_name": name}
    # fallback: zoeken (synoniemen, verouderde namen)
    for name in names:
        if name in out:
            continue
        hit = _search_fallback(http, name, bronze)
        out[name] = hit or {"qid": None, "match": "none", "matched_name": None}
    return out


def _search_fallback(http: Http, name: str, bronze: dict) -> dict | None:
    obj = http.get_json(
        WDAPI,
        params={"action": "wbsearchentities", "search": name, "language": "en", "type": "item", "limit": 5, "format": "json"},
    )
    bronze.setdefault("search", {})[name] = obj
    cands = [h["id"] for h in obj.get("search", [])]
    if not cands:
        return None
    values = " ".join(f"wd:{c}" for c in cands)
    rows = run_sparql(
        http,
        f"SELECT ?item ?name WHERE {{ VALUES ?item {{ {values} }} ?item wdt:P225 ?name . }}",
    )
    by_q = {_qid(_val(r, "item")): _val(r, "name") for r in rows}
    for c in cands:
        if c in by_q:
            log.warning("Geen exacte P225-match voor %r; zoekfallback gaf %s (%s)", name, c, by_q[c])
            return {"qid": c, "match": "search", "matched_name": by_q[c]}
    return None


# ------------------------------------------------------------------ stap 2


def fetch_fields(http: Http, qids: list[str], bronze: dict) -> dict[str, dict]:
    """Haal alle velden voor de QID's. Ontbrekend => None."""
    data = {q: _empty() for q in qids}
    for chunk in _chunks(qids, BATCH):
        vals = " ".join(f"wd:{q}" for q in chunk)
        _basic(http, vals, data, bronze)
        _iucn(http, vals, data, bronze)
        for prop, target in QUANTITY_PROPS.items():
            _quantity(http, vals, prop, target, data, bronze)
    _taxonomy(http, qids, data, bronze)
    for rec in data.values():
        _finalise(rec)
    return data


def _empty() -> dict:
    return {
        "label_nl": None, "label_en": None, "image_files": [], "commons_category": None,
        "gbif_id": None, "wikipedia_nl": None, "wikipedia_en": None,
        "iucn": None, "order": None, "family": None,
        "wingspan_cm": None, "mass_g": None, "lifespan_y": None,
        "_iucn": [], "_q": {"cm": [], "g": [], "y": []},
    }


def _basic(http, vals, data, bronze):
    q = f"""SELECT ?item (SAMPLE(?nl) AS ?nl) (SAMPLE(?en) AS ?en)
  (GROUP_CONCAT(DISTINCT ?img; separator="|") AS ?imgs)
  (SAMPLE(?cat) AS ?cat) (SAMPLE(?gbif) AS ?gbif) (SAMPLE(?nlw) AS ?nlw) (SAMPLE(?enw) AS ?enw) WHERE {{
  VALUES ?item {{ {vals} }}
  OPTIONAL {{ ?item rdfs:label ?nl . FILTER(LANG(?nl) = "nl") }}
  OPTIONAL {{ ?item rdfs:label ?en . FILTER(LANG(?en) = "en") }}
  OPTIONAL {{ ?item wdt:P18 ?img . }}
  OPTIONAL {{ ?item wdt:P373 ?cat . }}
  OPTIONAL {{ ?item wdt:P846 ?gbif . }}
  OPTIONAL {{ ?nlw schema:about ?item ; schema:isPartOf <https://nl.wikipedia.org/> . }}
  OPTIONAL {{ ?enw schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> . }}
}} GROUP BY ?item"""
    rows = run_sparql(http, q)
    bronze.setdefault("basic", []).extend(rows)
    for r in rows:
        d = data[_qid(_val(r, "item"))]
        d["label_nl"], d["label_en"] = _val(r, "nl"), _val(r, "en")
        imgs = _val(r, "imgs")
        d["image_files"] = [i for i in (imgs or "").split("|") if i]
        d["commons_category"] = _val(r, "cat")
        d["gbif_id"] = _val(r, "gbif")
        d["wikipedia_nl"], d["wikipedia_en"] = _val(r, "nlw"), _val(r, "enw")


def _iucn(http, vals, data, bronze):
    q = f"""SELECT ?item ?v ?rank WHERE {{
  VALUES ?item {{ {vals} }}
  ?item p:P141 ?st . ?st ps:P141 ?v ; wikibase:rank ?rank .
  FILTER(?rank != wikibase:DeprecatedRank)
}}"""
    rows = run_sparql(http, q)
    bronze.setdefault("iucn", []).extend(rows)
    for r in rows:
        code = IUCN_QID.get(_qid(_val(r, "v")))
        if code:
            pref = 0 if _val(r, "rank").endswith("PreferredRank") else 1
            data[_qid(_val(r, "item"))]["_iucn"].append((pref, code))


def _quantity(http, vals, prop, target, data, bronze):
    q = f"""SELECT ?item ?amt ?unit WHERE {{
  VALUES ?item {{ {vals} }}
  ?item p:{prop} ?st . ?st psv:{prop} ?v ; wikibase:rank ?rank .
  ?v wikibase:quantityAmount ?amt ; wikibase:quantityUnit ?unit .
  FILTER(?rank != wikibase:DeprecatedRank)
}}"""
    rows = run_sparql(http, q)
    bronze.setdefault(prop, []).extend(rows)
    for r in rows:
        v = units.normalise(float(_val(r, "amt")), _val(r, "unit"), target)
        if v is None:
            log.info("Onbekende eenheid %s bij %s %s", _val(r, "unit"), prop, _val(r, "item"))
            continue
        data[_qid(_val(r, "item"))]["_q"][target].append(v)


def _claim_ids(ent: dict, prop: str) -> list[str]:
    """QID's van een eigenschap (niet-gedeprecieerd; voorkeursrang eerst)."""
    cl = [c for c in ent.get("claims", {}).get(prop, []) if c.get("rank") != "deprecated"]
    cl.sort(key=lambda c: 0 if c.get("rank") == "preferred" else 1)
    out = []
    for c in cl:
        v = c.get("mainsnak", {}).get("datavalue", {}).get("value")
        if isinstance(v, dict) and "id" in v:
            out.append(v["id"])
    return out


def _claim_str(ent: dict, prop: str) -> str | None:
    for c in ent.get("claims", {}).get(prop, []):
        v = c.get("mainsnak", {}).get("datavalue", {}).get("value")
        if isinstance(v, str):
            return v
    return None


def _entities(http: Http, ids: list[str], cache: dict, bronze: dict) -> None:
    todo = [i for i in ids if i not in cache]
    for chunk in _chunks(todo, 50):
        obj = http.get_json(WDAPI, params={"action": "wbgetentities", "ids": "|".join(chunk), "props": "claims", "format": "json"})
        for qid, ent in obj.get("entities", {}).items():
            cache[qid] = {"claims": {p: ent.get("claims", {}).get(p, []) for p in ("P171", "P105", "P225")}}
    bronze.setdefault("taxonomy_entities", {}).update({i: cache[i] for i in todo if i in cache})


def _taxonomy(http, qids: list[str], data, bronze):
    """Loop de ouderketen (P171) via de entity-API (SPARQL P171* geeft time-outs).

    Rang via P105: orde Q36602, familie Q35409. Naam = P225 van de voorouder.
    """
    cache: dict = {}
    _entities(http, qids, cache, bronze)
    for q in qids:
        cur, seen = q, set()
        for _ in range(40):
            ent = cache.get(cur)
            if not ent or cur in seen:
                break
            seen.add(cur)
            ranks = _claim_ids(ent, "P105")
            name = _claim_str(ent, "P225")
            if RANK_FAMILY in ranks and data[q]["family"] is None:
                data[q]["family"] = name
            if RANK_ORDER in ranks:
                data[q]["order"] = name
                break
            parents = _claim_ids(ent, "P171")
            if not parents:
                break
            cur = parents[0]
            _entities(http, [cur], cache, bronze)


def _finalise(rec: dict) -> None:
    if rec["_iucn"]:
        # voorkeursrang eerst; bij gelijk de strengste categorie (voorzichtig)
        rec["iucn"] = sorted(rec["_iucn"], key=lambda t: (t[0], IUCN_SEVERITY.index(t[1])))[0][1]
    for prop, target in QUANTITY_PROPS.items():
        name = {"P2050": "wingspan_cm", "P2067": "mass_g", "P2250": "lifespan_y"}[prop]
        rec[name] = units.aggregate(rec["_q"][target], target)
    del rec["_iucn"], rec["_q"]


def coverage(records: list[dict], fields: list[str]) -> dict[str, int]:
    return {f: sum(1 for r in records if r.get(f) not in (None, [], "")) for f in fields}
