"""Bordtekst -> soorten: binomialen (Latijn) en Nederlandse/Engelse namen, fuzzy tegen de referentielijst."""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

from rapidfuzz import fuzz, process

LATIN_ACCEPT = 80.0
NAME_ACCEPT = 86.0

# Typische OCR-verwarringen in een Latijnse naam (cijfers/tekens die letters moeten zijn)
_OCR_FIX = str.maketrans({"1": "l", "0": "o", "5": "s", "|": "l", "!": "i", "$": "s", "8": "b", "6": "g"})
_TOKEN = re.compile(r"[A-Za-z0-9|!$À-ÿ]+")


def slugify(sci: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", sci.lower()).strip("-")


def strip_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def norm_name(s: str) -> str:
    s = strip_accents(s).lower()
    return re.sub(r"[^a-z ]+", " ", s).strip()


def _parts_ok(a: str, b: str, sci_key: str) -> bool:
    g, e = sci_key.split(" ", 1)
    return fuzz.ratio(a, g) >= 70 and fuzz.ratio(b, e) >= 70


@dataclass
class Match:
    sci: str
    name_nl: str | None
    qid: str | None
    score: float
    via: str  # "latijn", "nl", "en", "latijn+nl"
    evidence: str  # de tekst waarop gematcht is
    alternatives: list[tuple[str, float]] = field(default_factory=list)
    order: int = 0

    @property
    def slug(self) -> str:
        return slugify(self.sci)


class Matcher:
    def __init__(self, entries: list[dict]):
        self.entries = entries
        self.sci_keys = [e["sci"].lower() for e in entries]
        self.name_keys: list[str] = []
        self.name_owner: list[int] = []
        self.name_lang: list[str] = []
        for i, e in enumerate(entries):
            for lang in ("nl", "en"):
                if e.get(lang):
                    k = norm_name(e[lang])
                    if len(k) >= 4:
                        self.name_keys.append(k)
                        self.name_owner.append(i)
                        self.name_lang.append(lang)
        self.by_sci = {k: i for i, k in enumerate(self.sci_keys)}

    # -- Latijn -----------------------------------------------------------
    def _latin_hits(self, lines: list[str]) -> list[tuple[int, int, int, float, list[tuple[str, float]]]]:
        """(regel, tokenpositie, entry-index, score, alternatieven) voor elk token-paar."""
        hits = []
        for li, line in enumerate(lines):
            toks = _TOKEN.findall(line)
            for p in range(len(toks) - 1):
                a, b = toks[p].translate(_OCR_FIX).lower(), toks[p + 1].translate(_OCR_FIX).lower()
                if len(a) < 4 or len(b) < 3:
                    continue
                cand = f"{a} {b}"
                res = process.extract(cand, self.sci_keys, scorer=fuzz.ratio, limit=4, score_cutoff=LATIN_ACCEPT - 5)
                if not res:
                    continue
                # geslacht en soortnaam moeten elk apart overeenkomen (voorkomt dat 'rode ibis' op 'Ardea ibis' valt)
                ok = [r for r in res if _parts_ok(a, b, self.sci_keys[r[2]])]
                if not ok:
                    continue
                best = ok[0]
                alts = [(self.entries[r[2]]["sci"], round(r[1], 1)) for r in res if r is not best][:2]
                hits.append((li, p, best[2], float(best[1]), alts))
        return hits

    # -- Namen ------------------------------------------------------------
    def _name_hits(self, lines: list[str]):
        hits = []
        for li, line in enumerate(lines):
            toks = norm_name(line).split()
            for n in (3, 2, 1):
                for p in range(len(toks) - n + 1):
                    cand = " ".join(toks[p:p + n])
                    if len(cand) < 5:
                        continue
                    res = process.extract(cand, self.name_keys, scorer=fuzz.ratio, limit=6, score_cutoff=NAME_ACCEPT - 6)
                    if not res:
                        continue
                    seen: list[tuple[int, float, str]] = []
                    for key, sc, idx in res:
                        owner = self.name_owner[idx]
                        if all(owner != s[0] for s in seen):
                            seen.append((owner, float(sc), self.name_lang[idx]))
                    best = seen[0]
                    alts = [(self.entries[o]["sci"], round(s, 1)) for o, s, _ in seen[1:3]]
                    hits.append((li, p, n, best[0], best[1], best[2], cand, alts))
        return hits

    def match_text(self, text: str) -> list[Match]:
        lines = [ln for ln in (text or "").splitlines() if ln.strip()]
        if not lines:
            return []
        # Latijnse treffers: hoogste score eerst, tokens mogen niet overlappen
        latin: dict[int, Match] = {}
        used: set[tuple[int, int]] = set()
        for li, p, idx, sc, alts in sorted(self._latin_hits(lines), key=lambda h: -h[3]):
            if sc < LATIN_ACCEPT or (li, p) in used or (li, p + 1) in used or idx in latin:
                continue
            used.update({(li, p), (li, p + 1)})
            e = self.entries[idx]
            latin[idx] = Match(e["sci"], e.get("nl"), e.get("qid"), round(sc, 1), "latijn",
                               " ".join(_TOKEN.findall(lines[li])[p:p + 2]), alts, li * 100 + p)
        # Naamtreffers
        names: dict[int, Match] = {}
        nused: set[tuple[int, int]] = set()
        for li, p, n, idx, sc, lang, cand, alts in sorted(self._name_hits(lines), key=lambda h: -(h[4] + h[2] * 3)):
            span = {(li, p + k) for k in range(n)}
            if sc < NAME_ACCEPT or span & nused or idx in names:
                continue
            nused |= span
            e = self.entries[idx]
            names[idx] = Match(e["sci"], e.get("nl"), e.get("qid"), round(sc, 1), lang, cand, alts, li * 100 + p)
        out: list[Match] = []
        if latin:
            for idx, m in latin.items():
                if idx in names:  # Latijn en naam wijzen naar dezelfde soort: extra zeker
                    m.score = round(min(100.0, m.score + (100 - m.score) * 0.5 + 2), 1)
                    m.via = "latijn+nl"
                out.append(m)
        else:
            for m in names.values():
                m.score = round(m.score * 0.9, 1)  # alleen naam: minder zeker dan binomiaal
                out.append(m)
        return sorted(out, key=lambda m: m.order)
