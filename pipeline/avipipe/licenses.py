"""Licentiefilters. Eén plek voor de regels uit CLAUDE.md en docs/CONTRACT.md.

Foto's (Commons): alleen CC0, PD(M), CC BY *, CC BY-SA *.
Geluid (xeno-canto): alleen BY-SA, CC0/PD en BY-NC-SA. Nooit ND, nooit BY-NC (zonder SA).
"""
from __future__ import annotations

import re

# ---------------------------------------------------------------- slug


def slugify(scientific_name: str) -> str:
    """Wetenschappelijke naam -> slug (lowercase, spatie -> '-')."""
    return re.sub(r"\s+", "-", scientific_name.strip().lower())


# ---------------------------------------------------------------- Commons

_CC_URL = {
    "CC0-1.0": "https://creativecommons.org/publicdomain/zero/1.0/",
    "PDM": "https://creativecommons.org/publicdomain/mark/1.0/",
}


def _cc_url(spdx: str) -> str:
    if spdx in _CC_URL:
        return _CC_URL[spdx]
    m = re.match(r"CC-(BY(?:-SA)?)-(\d\.\d)", spdx)
    if not m:
        return ""
    return f"https://creativecommons.org/licenses/{m.group(1).lower()}/{m.group(2)}/"


_PORTS = {"de", "at", "nl", "fr", "es", "it", "pl", "ch", "au", "uk", "us", "nz", "ie", "fi", "no", "dk", "se", "ca"}


def commons_license(short_name: str | None, key: str | None = None) -> tuple[str | None, str | None]:
    """Vertaal Commons-licentie (LicenseShortName + License-sleutel) naar (SPDX, reden_afwijzing).

    Geeft (spdx, None) bij acceptatie, (None, reden) bij afwijzing.
    """
    short = (short_name or "").strip()
    k = (key or "").strip().lower()
    text = f"{short} {k}".lower()
    if not text.strip():
        return None, "geen licentie-informatie"

    tokens = set(re.findall(r"[a-z0-9]+", text))
    if "nc" in tokens or "noncommercial" in tokens or "non" in tokens and "commercial" in tokens:
        return None, "NC (niet-commercieel)"
    if "nd" in tokens or "noderivs" in tokens:
        return None, "ND (niet bewerken)"
    if "fair" in tokens and "use" in tokens:
        return None, "fair use"

    # CC BY / CC BY-SA met versienummer
    m = re.search(r"cc[\s-]*by(?:[\s-]*(sa))?[\s-]*(\d\.\d)(?:[\s-]*([a-z]{2})\b)?", text)
    if m:
        sa, ver, port = m.group(1), m.group(2), m.group(3)
        spdx = f"CC-BY{'-SA' if sa else ''}-{ver}"
        if port and port in _PORTS and ver in ("2.0", "2.5", "3.0") and port != "us":
            spdx += f"-{port.upper()}"
        return spdx, None

    # CC0
    if re.search(r"\bcc[\s-]*0\b|\bcc[\s-]*zero\b|publicdomain/zero", text):
        return "CC0-1.0", None

    # Publiek domein
    if re.search(r"public domain|\bpdm\b|^pd\b|\bpd-|\bpd\b|no known copyright|copyright expired", text):
        return "PDM", None

    if "gfdl" in tokens:
        return None, "alleen GFDL"
    return None, f"licentie niet toegestaan: {short or k}"


def commons_license_url(spdx: str, given: str | None) -> str:
    return (given or "").strip() or _cc_url(spdx)


# ---------------------------------------------------------------- xeno-canto


def xc_license(lic_url: str | None) -> tuple[str | None, str | None, bool]:
    """Vertaal xeno-canto 'lic'-URL naar (SPDX, reden_afwijzing, is_nc).

    Toegestaan: by-sa, cc0/publicdomain, by-nc-sa. Al het andere (by, by-nc, *-nd) wordt afgewezen.
    """
    u = (lic_url or "").lower().strip()
    if u.startswith("//"):
        u = "https:" + u
    m = re.search(r"creativecommons\.org/(licenses|publicdomain)/([a-z\-]+)/(\d\.\d)", u)
    if not m:
        return None, f"onbekende licentie: {lic_url}", False
    kind, code, ver = m.groups()
    if kind == "publicdomain":
        if code in ("zero", "cc0"):
            return "CC0-1.0", None, False
        return "PDM", None, False
    if "nd" in code.split("-"):
        return None, "ND", False
    if code == "by-sa":
        return f"CC-BY-SA-{ver}", None, False
    if code == "by-nc-sa":
        return f"CC-BY-NC-SA-{ver}", None, True
    return None, f"licentie niet toegestaan: {code}", False
