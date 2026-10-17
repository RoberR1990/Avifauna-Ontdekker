"""Tesseract instellen: taaldata uit tools/tessdata, Nederlands zo nodig downloaden."""
from __future__ import annotations

import os
import shutil
from pathlib import Path

from .paths import TESSDATA_DIR, TESSERACT_EXE

BASE = "https://github.com/tesseract-ocr/tessdata_best/raw/main/"


def ensure_language(lang: str, tessdata: Path = TESSDATA_DIR) -> Path:
    """Zorg dat <lang>.traineddata bestaat (download uit tessdata_best als het ontbreekt)."""
    target = tessdata / f"{lang}.traineddata"
    if target.exists():
        return target
    import requests

    tessdata.mkdir(parents=True, exist_ok=True)
    r = requests.get(BASE + f"{lang}.traineddata", timeout=120)
    r.raise_for_status()
    target.write_bytes(r.content)
    return target


def setup_tesseract(languages=("nld", "eng", "osd"), download: bool = True) -> bool:
    """Stel pytesseract in. Geeft False als tesseract of de taaldata ontbreekt."""
    import pytesseract

    if TESSERACT_EXE.exists():
        pytesseract.pytesseract.tesseract_cmd = str(TESSERACT_EXE)
    elif not shutil.which("tesseract"):
        return False
    for lang in languages:
        if not (TESSDATA_DIR / f"{lang}.traineddata").exists():
            if not download:
                return False
            try:
                ensure_language(lang)
            except Exception:
                return False
    os.environ["TESSDATA_PREFIX"] = str(TESSDATA_DIR)
    return True
