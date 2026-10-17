"""Gedeelde configuratie: paden, User-Agent, ffmpeg zoeken."""
from __future__ import annotations

import glob
import os
import shutil
from datetime import date
from pathlib import Path

USER_AGENT = "AvifaunaOntdekker/0.1 (https://github.com/RoberR1990/Avifauna-Ontdekker)"

PIPELINE_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = PIPELINE_DIR.parent
# HTTP-cache; te overschrijven met env AVIPIPE_CACHE_DIR (bv. de cache van de hoofdcheckout)
CACHE_DIR = Path(os.environ["AVIPIPE_CACHE_DIR"]) if os.environ.get("AVIPIPE_CACHE_DIR") else PIPELINE_DIR / "data" / "cache"
NC_AUDIO_DIR = REPO_ROOT / "build-cache" / "audio"


def today() -> str:
    return date.today().isoformat()


def load_env() -> None:
    """Laad .env uit de repo-root (geheimen, o.a. XENO_CANTO_API_KEY)."""
    try:
        from dotenv import load_dotenv

        load_dotenv(REPO_ROOT / ".env")
    except ImportError:  # pragma: no cover
        pass


def find_ffmpeg() -> str | None:
    """Zoek ffmpeg: env FFMPEG, dan PATH, dan de winget-map."""
    env = os.environ.get("FFMPEG")
    if env and Path(env).exists():
        return env
    found = shutil.which("ffmpeg")
    if found:
        return found
    local = os.environ.get("LOCALAPPDATA")
    if local:
        hits = glob.glob(
            os.path.join(local, "Microsoft", "WinGet", "Packages", "Gyan.FFmpeg*", "**", "bin", "ffmpeg.exe"),
            recursive=True,
        )
        if hits:
            return hits[0]
    return None
