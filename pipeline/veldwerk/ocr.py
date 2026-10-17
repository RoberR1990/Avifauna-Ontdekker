"""Tekstherkenning op naambordjes met tesseract (nld+eng)."""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path

from PIL import Image, ImageOps

from .exif import register_heif

MAX_SIDE = 2600  # grotere foto's (iPhone 4032 px) verkleinen voor snelheid
MIN_SIDE = 1400  # kleinere foto's opschalen
GOOD_CONF = 60.0


@dataclass
class OcrResult:
    text: str = ""
    confidence: float = 0.0  # gemiddelde woordzekerheid 0-100
    rotation: int = 0
    variant: str = "normaal"

    def alnum_len(self) -> int:
        return sum(c.isalnum() for c in self.text)


def prepare_image(path: Path) -> Image.Image:
    """Laad, pas EXIF-oriëntatie toe, grijswaarden, autocontrast, schaal."""
    register_heif()
    with Image.open(path) as im:
        im = ImageOps.exif_transpose(im)
        im = im.convert("L")
    im = ImageOps.autocontrast(im, cutoff=1)
    w, h = im.size
    big = max(w, h)
    if big > MAX_SIDE:
        s = MAX_SIDE / big
        im = im.resize((round(w * s), round(h * s)), Image.LANCZOS)
    elif big < MIN_SIDE:
        s = MIN_SIDE / big
        im = im.resize((round(w * s), round(h * s)), Image.LANCZOS)
    return im


def _run_tesseract(im: Image.Image, psm: int) -> tuple[str, float]:
    import pytesseract

    data = pytesseract.image_to_data(
        im, lang="nld+eng", config=f"--psm {psm}", output_type=pytesseract.Output.DICT
    )
    lines: dict[tuple, list[str]] = {}
    confs: list[float] = []
    for i, word in enumerate(data["text"]):
        word = (word or "").strip()
        try:
            conf = float(data["conf"][i])
        except (TypeError, ValueError):
            conf = -1
        if not word or conf < 0:
            continue
        key = (data["block_num"][i], data["par_num"][i], data["line_num"][i])
        lines.setdefault(key, []).append(word)
        confs.append(conf)
    text = "\n".join(" ".join(ws) for ws in lines.values())
    return text, (sum(confs) / len(confs) if confs else 0.0)


def _score(r: OcrResult) -> float:
    # zekerheid telt zwaar, maar een resultaat zonder tekst wint nooit
    return r.confidence * min(1.0, r.alnum_len() / 12.0)


def _osd_angle(im: Image.Image) -> int | None:
    import pytesseract

    try:
        osd = pytesseract.image_to_osd(im, config="--psm 0", output_type=pytesseract.Output.DICT)
        if float(osd.get("orientation_conf", 0)) >= 2:
            return int(osd["rotate"])
    except Exception:
        return None
    return None


def _good(r: OcrResult) -> bool:
    return r.confidence >= GOOD_CONF and r.alnum_len() >= 8


def ocr_image(path: Path) -> OcrResult:
    im = prepare_image(path)
    best = OcrResult()
    for psm in (11, 6):  # eerst losse tekst (borden), dan blok
        text, conf = _run_tesseract(im, psm)
        cand = OcrResult(text, conf, 0, f"psm{psm}")
        if _score(cand) > _score(best):
            best = cand
        if _good(best):
            return best
    # lage zekerheid: oriëntatie via OSD, anders alle rotaties, plus omgekeerde kleuren
    tried: list[tuple[str, Image.Image, int]] = []
    ang = _osd_angle(im)
    if ang:
        tried.append((f"osd{ang}", im.rotate(-ang, expand=True), ang))
    tried.append(("invers", ImageOps.invert(im), 0))
    if not ang:
        for a in (90, 180, 270):
            tried.append((f"rot{a}", im.rotate(-a, expand=True), a))
    for name, img, a in tried:
        text, conf = _run_tesseract(img, 11)
        cand = OcrResult(text, conf, a, name)
        if _score(cand) > _score(best):
            best = cand
        if _good(best):
            break
    return best


def load_cache(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def save_cache(path: Path, cache: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")


def cache_key(path: Path) -> str:
    st = path.stat()
    return f"{path.name}|{st.st_size}|{int(st.st_mtime)}"


def result_to_dict(r: OcrResult) -> dict:
    return asdict(r)
