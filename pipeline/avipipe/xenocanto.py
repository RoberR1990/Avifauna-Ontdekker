"""xeno-canto API v3: opnames zoeken, selecteren en bewerken tot een fragment van 8 s.

Licentieregels (zie licenses.xc_license): alleen BY-SA, CC0/PD en BY-NC-SA.
BY-NC-SA gaat NOOIT naar de repo-mediamap maar naar build-cache/audio/ (in_repo=false).
Elke fout per soort wordt gelogd en overgeslagen; de build faalt er nooit door.
"""
from __future__ import annotations

import logging
import os
import re
import subprocess
import tempfile
from pathlib import Path

import numpy as np

from .config import NC_AUDIO_DIR, find_ffmpeg, today
from .http import Http
from .licenses import xc_license

log = logging.getLogger("avipipe")

API = "https://xeno-canto.org/api/3/recordings"
LIC_QUERIES = ["BY-SA", "PD", "CC0", "BY-NC-SA"]
CLIP_SECONDS = 8.0
FADE = 0.2
SR = 16000


def parse_length(s: str | None) -> float | None:
    """'0:45' -> 45.0, '1:02:03' -> 3723.0; onbekend -> None."""
    if not s:
        return None
    parts = str(s).strip().split(":")
    try:
        nums = [float(p) for p in parts]
    except ValueError:
        return None
    sec = 0.0
    for n in nums:
        sec = sec * 60 + n
    return sec


def _type_rank(t: str | None) -> int:
    t = (t or "").lower()
    if "song" in t:
        return 0
    if "call" in t:
        return 1
    return 2


def select_candidates(recordings: list[dict], max_len: float = 60.0) -> list[dict]:
    """Filter en sorteer. Elk resultaat krijgt '_spdx' en '_nc'.

    Volgorde: kwaliteit A voor B, song/call-voorkeur, korter, recenter (upload-datum).
    """
    out = []
    for r in recordings:
        if r.get("q") not in ("A", "B"):
            continue
        length = parse_length(r.get("length"))
        if length is None or length > max_len or length < 2:
            continue
        f = r.get("file") or ""
        if not f or f == "restricted_species" or "_meta" in r:
            continue
        spdx, _reason, nc = xc_license(r.get("lic"))
        if not spdx:
            continue
        r = dict(r)
        r["_spdx"], r["_nc"], r["_len"] = spdx, nc, length
        out.append(r)

    def key(r):
        uploaded = r.get("uploaded") or "0000-00-00"
        ymd = [-int(x) for x in re.findall(r"\d+", uploaded)] or [0]
        return (0 if r["q"] == "A" else 1, _type_rank(r.get("type")), r["_len"], ymd)

    return sorted(out, key=key)


def search(http: Http, scientific_name: str, api_key: str, bronze: dict) -> list[dict]:
    """Haal opnames op (kwaliteit > C, <= 60 s) per toegestane licentie."""
    found: dict[str, dict] = {}
    for lic in LIC_QUERIES:
        query = f'sp:"{scientific_name.lower()}" lic:"{lic}" q:">C" len:"<61"'
        try:
            obj = http.get_json(API, params={"query": query, "key": api_key, "per_page": 100})
        except Exception as e:  # netwerk/400: niet fataal
            log.warning("xeno-canto zoeken mislukt voor %s (%s): %s", scientific_name, lic, _scrub(str(e), api_key))
            continue
        bronze.setdefault(scientific_name, {})[lic] = {k: v for k, v in obj.items() if k != "recordings"} | {
            "recordings": [_slim(r) for r in obj.get("recordings", [])]
        }
        for r in obj.get("recordings", []):
            found[r["id"]] = r
    return list(found.values())


def _slim(r: dict) -> dict:
    keep = ("id", "gen", "sp", "en", "rec", "type", "q", "length", "lic", "url", "file", "date", "uploaded")
    return {k: r.get(k) for k in keep}


def _scrub(s: str, key: str) -> str:
    return s.replace(key, "***") if key else s


# ---------------------------------------------------------------- audio bewerken


def energetic_start(samples: np.ndarray, sr: int, clip: float = CLIP_SECONDS, hop: float = 0.25) -> float:
    """Beginpunt (s) van het venster met de hoogste RMS. Korter dan 'clip' => 0."""
    n = int(clip * sr)
    if len(samples) <= n:
        return 0.0
    step = max(1, int(hop * sr))
    x = samples.astype(np.float64) ** 2
    cs = np.concatenate([[0.0], np.cumsum(x)])
    starts = np.arange(0, len(samples) - n + 1, step)
    energy = (cs[starts + n] - cs[starts]) / n
    return float(starts[int(np.argmax(energy))] / sr)


def _decode_pcm(ffmpeg: str, path: Path) -> np.ndarray:
    p = subprocess.run(
        [ffmpeg, "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"],
        capture_output=True, check=True,
    )
    return np.frombuffer(p.stdout, dtype=np.int16).astype(np.float32) / 32768.0


def make_clips(ffmpeg: str, src: Path, out_opus: Path, out_m4a: Path) -> dict:
    """Snij het meest energieke venster van 8 s, fades van 0,2 s, mono Opus 32k + AAC 48k."""
    pcm = _decode_pcm(ffmpeg, src)
    if len(pcm) == 0:
        raise RuntimeError("lege audio")
    total = len(pcm) / SR
    start = energetic_start(pcm, SR)
    dur = min(CLIP_SECONDS, total - start)
    fade = min(FADE, dur / 4)
    af = f"afade=t=in:st=0:d={fade:.2f},afade=t=out:st={max(dur - fade, 0):.2f}:d={fade:.2f}"
    for out, codec in ((out_opus, ["-c:a", "libopus", "-b:a", "32k", "-f", "ogg"]), (out_m4a, ["-c:a", "aac", "-b:a", "48k", "-f", "mp4"])):
        out.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            [ffmpeg, "-v", "error", "-y", "-ss", f"{start:.2f}", "-t", f"{dur:.2f}", "-i", str(src), "-vn", "-map_metadata", "-1", "-ac", "1", "-af", af, *codec, str(out)],
            check=True, capture_output=True,
        )
    return {"start": round(start, 2), "duration": round(dur, 2)}


# ---------------------------------------------------------------- per soort


def build_audio(http: Http, rec: dict, slug: str, species_name: str, media_dir: Path, ffmpeg: str,
                nc_dir: Path | None = None) -> list[dict]:
    """Maak audiobestanden + attributierecords voor één gekozen opname."""
    nc_dir = nc_dir or NC_AUDIO_DIR
    data = http.get_bytes(rec["file"])
    nc = rec["_nc"]
    target_dir = nc_dir if nc else media_dir / "audio"
    rel_prefix = "build-cache/audio" if nc else "media/audio"
    opus, m4a = target_dir / f"{slug}.opus", target_dir / f"{slug}.m4a"
    with tempfile.TemporaryDirectory() as td:
        src = Path(td) / "src.audio"
        src.write_bytes(data)
        info = make_clips(ffmpeg, src, opus, m4a)
    modified = (
        f"trimmed to {info['duration']:.0f} s (from {info['start']:.1f} s, most energetic window), "
        "0.2 s fades, mono; Opus 32 kbps / AAC 48 kbps"
    )
    base = {
        "slug": slug, "kind": "audio", "source": "xeno-canto",
        "source_url": f"https://xeno-canto.org/{rec['id']}",
        "creator": rec.get("rec") or "onbekend", "license": rec["_spdx"],
        "license_url": rec.get("lic") or "", "title": f"XC{rec['id']} {species_name}",
        "retrieved": today(), "modified": modified, "in_repo": not nc,
    }
    return [{**base, "file": f"{rel_prefix}/{slug}.opus"}, {**base, "file": f"{rel_prefix}/{slug}.m4a"}]


def process_species(http: Http, species_name: str, slug: str, media_dir: Path, api_key: str, ffmpeg: str,
                    bronze: dict, nc_dir: Path | None = None) -> list[dict]:
    """Probeer kandidaten in volgorde; geef [] bij niets. Gooit nooit een uitzondering door."""
    try:
        recs = search(http, species_name, api_key, bronze)
        cands = select_candidates(recs)
    except Exception as e:
        log.warning("xeno-canto fout voor %s: %s", species_name, _scrub(str(e), api_key))
        return []
    if not cands:
        log.info("Geen bruikbare opname voor %s", species_name)
        return []
    for rec in cands[:5]:
        try:
            return build_audio(http, rec, slug, species_name, media_dir, ffmpeg, nc_dir)
        except Exception as e:  # opname weg / download- of ffmpegfout
            log.warning("Opname XC%s voor %s mislukt: %s", rec.get("id"), species_name, _scrub(str(e), api_key))
    return []
