"""Wikimedia Commons: foto's met licentiecontrole, WebP-conversie, attributie."""
from __future__ import annotations

import html
import io
import logging
import re
from pathlib import Path
from urllib.parse import unquote

from PIL import Image

from .config import today
from .http import Http
from .licenses import commons_license, commons_license_url

log = logging.getLogger("avipipe")

API = "https://commons.wikimedia.org/w/api.php"
IMAGE_MIMES = {"image/jpeg", "image/png", "image/webp"}
MAX_CANDIDATES = 12


def strip_html(s: str | None) -> str:
    if not s:
        return ""
    s = re.sub(r"<[^>]+>", "", s)
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


def file_title_from_p18(url_or_name: str) -> str:
    """P18 geeft een Special:FilePath-URL; haal de bestandsnaam eruit -> 'File:Naam.jpg'."""
    name = unquote(url_or_name.rsplit("/", 1)[-1]).replace("_", " ")
    return name if name.startswith("File:") else f"File:{name}"


def _imageinfo(http: Http, titles: list[str], bronze: dict) -> dict[str, dict]:
    res: dict[str, dict] = {}
    for i in range(0, len(titles), 25):
        chunk = titles[i : i + 25]
        obj = http.get_json(
            API,
            params={
                "action": "query", "format": "json", "formatversion": "2",
                "titles": "|".join(chunk), "prop": "imageinfo",
                "iiprop": "url|extmetadata|mime|size", "iiurlwidth": 1200,
            },
        )
        bronze.setdefault("imageinfo", []).append(obj)
        for page in obj.get("query", {}).get("pages", []):
            ii = (page.get("imageinfo") or [None])[0]
            if ii:
                res[page["title"]] = ii
    return res


def category_files(http: Http, category: str, bronze: dict) -> list[str]:
    cat = category if category.startswith("Category:") else f"Category:{category}"
    obj = http.get_json(
        API,
        params={"action": "query", "format": "json", "formatversion": "2", "list": "categorymembers",
                "cmtitle": cat, "cmtype": "file", "cmlimit": 40},
    )
    bronze.setdefault("category", {})[cat] = obj
    return [m["title"] for m in obj.get("query", {}).get("categorymembers", [])]


def evaluate(title: str, ii: dict) -> tuple[dict | None, str | None]:
    """Beoordeel één bestand. Geeft (kandidaat, None) of (None, reden)."""
    if ii.get("mime") not in IMAGE_MIMES:
        return None, f"bestandstype {ii.get('mime')}"
    em = ii.get("extmetadata") or {}

    def g(k):
        return (em.get(k) or {}).get("value")

    spdx, reason = commons_license(g("LicenseShortName"), g("License"))
    if not spdx:
        return None, f"{reason} ({g('LicenseShortName') or g('License') or '?'})"
    creator = strip_html(g("Artist")) or strip_html(g("Credit")) or "onbekend"
    cand = {
        "title": title,
        "source_url": ii.get("descriptionurl") or f"https://commons.wikimedia.org/wiki/{title.replace(' ', '_')}",
        "thumb_url": ii.get("thumburl") or ii.get("url"),
        "creator": creator,
        "license": spdx,
        "license_url": commons_license_url(spdx, g("LicenseUrl")),
        "description": strip_html(g("ImageDescription")) or strip_html(g("ObjectName")),
        "credit": strip_html(g("Credit")),
    }
    return cand, None


def pick_photo(http: Http, image_files: list[str], category: str | None, bronze: dict):
    """Eerste toegestane foto: eerst P18-bestanden, dan categorie. Geeft (kandidaat|None, afgewezen[])."""
    titles = [file_title_from_p18(f) for f in image_files]
    rejected: list[dict] = []
    tried: set[str] = set()

    def try_titles(ts: list[str]):
        ts = [t for t in ts if t not in tried][:MAX_CANDIDATES]
        tried.update(ts)
        if not ts:
            return None
        info = _imageinfo(http, ts, bronze)
        for t in ts:
            ii = info.get(t)
            if not ii:
                rejected.append({"file": t, "reason": "geen imageinfo"})
                continue
            cand, why = evaluate(t, ii)
            if cand:
                return cand
            rejected.append({"file": t, "reason": why})
        return None

    cand = try_titles(titles)
    if cand is None and category:
        cand = try_titles(category_files(http, category, bronze))
    return cand, rejected


def save_webp(img_bytes: bytes, dest: Path, max_width: int, quality: int = 80) -> tuple[int, int]:
    im = Image.open(io.BytesIO(img_bytes))
    im = im.convert("RGB") if im.mode not in ("RGB", "RGBA") else im
    if im.width > max_width:
        h = round(im.height * max_width / im.width)
        im = im.resize((max_width, h), Image.LANCZOS)
    dest.parent.mkdir(parents=True, exist_ok=True)
    im.save(dest, "WEBP", quality=quality, method=6)
    return im.size


def build_photo(http: Http, cand: dict, slug: str, media_dir: Path) -> list[dict]:
    """Download, converteer en geef attributierecords (hoofdfoto + thumb)."""
    data = http.get_bytes(cand["thumb_url"])
    main = media_dir / "photos" / f"{slug}.webp"
    thumb = media_dir / "photos" / f"{slug}-thumb.webp"
    save_webp(data, main, 1200)
    save_webp(data, thumb, 400)
    base = {
        "slug": slug, "kind": "photo", "source": "wikimedia-commons",
        "source_url": cand["source_url"], "creator": cand["creator"],
        "license": cand["license"], "license_url": cand["license_url"],
        "title": cand["title"].removeprefix("File:"), "retrieved": today(), "in_repo": True,
    }
    return [
        {**base, "file": f"media/photos/{slug}.webp", "modified": "resized to max 1200 px wide, converted to WebP (q80)"},
        {**base, "file": f"media/photos/{slug}-thumb.webp", "modified": "resized to max 400 px wide, converted to WebP (q80)"},
    ]
