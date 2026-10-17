"""Standaardpaden, afgeleid van de repo-structuur (pipeline/veldwerk/paths.py)."""
from pathlib import Path

PIPELINE_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = PIPELINE_DIR.parent
VELDWERK_DIR = REPO_ROOT / "veldwerk"
UITVOER_DIR = VELDWERK_DIR / "uitvoer"
PARK_DIR = REPO_ROOT / "parks" / "avifauna"
NAMES_CACHE = PIPELINE_DIR / "data" / "cache" / "bird-names.json"
TESSDATA_DIR = REPO_ROOT / "tools" / "tessdata"
TESSERACT_EXE = Path(r"C:\Program Files\Tesseract-OCR\tesseract.exe")
USER_AGENT = "AvifaunaOntdekker/0.1 (https://github.com/RoberR1990/Avifauna-Ontdekker)"
