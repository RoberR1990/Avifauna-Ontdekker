"""EXIF lezen: GPS, tijd, oriëntatie. Foto's zonder GPS worden gemarkeerd, niet weggelaten."""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from PIL import Image

IMAGE_EXTS = {".jpg", ".jpeg", ".heic", ".heif", ".png"}

_heif_registered = False


def register_heif() -> bool:
    """Zet HEIC-ondersteuning aan (pillow-heif). Geeft False als het pakket ontbreekt."""
    global _heif_registered
    if _heif_registered:
        return True
    try:
        import pillow_heif

        pillow_heif.register_heif_opener()
        _heif_registered = True
    except ImportError:
        return False
    return True


def _num(x: Any) -> float:
    """Eén EXIF-getal: float, int, IFDRational of (teller, noemer)."""
    if isinstance(x, (tuple, list)) and len(x) == 2:
        num, den = x
        return float(num) / float(den) if den else 0.0
    return float(x)


def dms_to_deg(value: Any, ref: Any) -> float | None:
    """(graden, minuten, seconden) + N/S/E/W -> decimale graden (S en W negatief).

    Elk deel mag float, int, IFDRational of (teller, noemer) zijn. Ook een
    enkele decimale waarde wordt geaccepteerd.
    """
    if value is None:
        return None
    try:
        if isinstance(value, (tuple, list)) and len(value) == 3:
            d, m, s = (_num(p) for p in value)
            deg = d + m / 60.0 + s / 3600.0
        elif isinstance(value, (tuple, list)) and len(value) == 2 and not isinstance(value[0], (tuple, list)):
            deg = _num(value)  # (teller, noemer) als één getal
        else:
            deg = _num(value)
    except (TypeError, ValueError, ZeroDivisionError):
        return None
    if isinstance(ref, bytes):
        ref = ref.decode("ascii", "ignore")
    if str(ref or "").strip().upper()[:1] in ("S", "W"):
        deg = -deg
    return deg


@dataclass
class PhotoMeta:
    path: Path
    lat: float | None = None
    lon: float | None = None
    accuracy_m: float | None = None
    altitude_m: float | None = None
    taken: datetime | None = None  # naïeve lokale tijd
    offset: str | None = None  # bv. "+02:00"
    orientation: int = 1
    width: int = 0
    height: int = 0
    pos_estimated: bool = False

    @property
    def has_gps(self) -> bool:
        return self.lat is not None and self.lon is not None


_DT_RE = re.compile(r"^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})")


def parse_exif_datetime(s: Any) -> datetime | None:
    if isinstance(s, bytes):
        s = s.decode("ascii", "ignore")
    if not s:
        return None
    m = _DT_RE.match(str(s).strip())
    if not m:
        return None
    try:
        return datetime(*(int(g) for g in m.groups()))
    except ValueError:
        return None


def meta_from_exif(path: Path, exif, width: int = 0, height: int = 0) -> PhotoMeta:
    """Bouw PhotoMeta uit een PIL Exif-object."""
    meta = PhotoMeta(path=path, width=width, height=height)
    try:
        meta.orientation = int(exif.get(0x0112, 1) or 1)
    except (TypeError, ValueError):
        meta.orientation = 1
    try:
        ifd = exif.get_ifd(0x8769)
    except Exception:
        ifd = {}
    meta.taken = parse_exif_datetime(ifd.get(0x9003) or ifd.get(0x9004) or exif.get(0x0132))
    off = ifd.get(0x9011)
    if isinstance(off, bytes):
        off = off.decode("ascii", "ignore")
    meta.offset = off.strip() if off else None
    try:
        gps = exif.get_ifd(0x8825)
    except Exception:
        gps = {}
    if gps:
        lat = dms_to_deg(gps.get(2), gps.get(1))
        lon = dms_to_deg(gps.get(4), gps.get(3))
        if lat is not None and lon is not None and not (lat == 0 and lon == 0) and abs(lat) <= 90 and abs(lon) <= 180:
            meta.lat, meta.lon = lat, lon
        if gps.get(31) is not None:  # GPSHPositioningError (m)
            try:
                meta.accuracy_m = _num(gps[31])
            except (TypeError, ValueError):
                pass
        if gps.get(6) is not None:
            try:
                alt = _num(gps[6])
                ref = gps.get(5, 0)
                if ref in (1, b"\x01"):
                    alt = -alt
                meta.altitude_m = alt
            except (TypeError, ValueError):
                pass
    return meta


def read_meta(path: Path) -> PhotoMeta:
    register_heif()
    with Image.open(path) as im:
        return meta_from_exif(path, im.getexif(), *im.size)


def find_photos(folder: Path) -> list[Path]:
    """Alle foto's direct in en onder `folder`, behalve de map uitvoer/."""
    out = []
    for p in sorted(folder.rglob("*")):
        if p.is_file() and p.suffix.lower() in IMAGE_EXTS and "uitvoer" not in p.relative_to(folder).parts:
            out.append(p)
    return out
