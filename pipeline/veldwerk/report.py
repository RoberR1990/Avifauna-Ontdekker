"""controlelijst.html: zelfstandige pagina (NL) waarmee de eigenaar de uitkomst controleert."""
from __future__ import annotations

import base64
import io
from datetime import datetime
from html import escape
from pathlib import Path

from PIL import Image, ImageOps

from .exif import register_heif
from .process import FLAG_ESTIMATED, Result, attention_count, photo_date


def thumbnail_data_uri(path: Path, size: int = 200) -> str:
    register_heif()
    try:
        with Image.open(path) as im:
            im = ImageOps.exif_transpose(im).convert("RGB")
            im.thumbnail((size, size))
            buf = io.BytesIO()
            im.save(buf, "JPEG", quality=70)  # EXIF/GPS wordt niet meegeschreven
    except Exception:
        return ""
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def osm_link(lat: float, lon: float) -> str:
    return f"https://www.openstreetmap.org/?mlat={lat:.6f}&mlon={lon:.6f}#map=19/{lat:.6f}/{lon:.6f}"


CSS = """
:root{--bg:#fafaf7;--fg:#1d2a22;--mut:#5f6b64;--line:#d9ddd5;--card:#fff;--warn:#fff3cd;--warnfg:#7a5b00;--bad:#fde2e0;--badfg:#8a1c14;--ok:#e3f3e6;--okfg:#1c5e2b}
@media (prefers-color-scheme:dark){:root{--bg:#171b18;--fg:#e8ece9;--mut:#9aa69f;--line:#33403a;--card:#1f2521;--warn:#4a3d10;--warnfg:#ffe08a;--bad:#4d1f1b;--badfg:#ffb4ab;--ok:#1d3b25;--okfg:#9be3ad}}
body{font:15px/1.4 system-ui,sans-serif;background:var(--bg);color:var(--fg);margin:0;padding:16px}
h1{font-size:1.4rem;margin:0 0 4px}.sub{color:var(--mut);margin:0 0 16px}
.sum{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px}
.sum div{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:8px 14px}
.sum b{display:block;font-size:1.5rem}
table{border-collapse:collapse;width:100%;background:var(--card)}
th,td{border:1px solid var(--line);padding:6px 8px;vertical-align:top;text-align:left}
th{position:sticky;top:0;background:var(--card);font-size:.8rem;text-transform:uppercase;color:var(--mut)}
td.img img{display:block;max-width:200px;max-height:200px;border-radius:4px}
.flag{display:inline-block;padding:1px 7px;border-radius:10px;font-size:.8rem;margin:1px 2px 1px 0;background:var(--warn);color:var(--warnfg)}
.flag.bad{background:var(--bad);color:var(--badfg)}.flag.info{background:var(--ok);color:var(--okfg)}
.ocr{font-family:ui-monospace,monospace;font-size:.85rem;white-space:pre-wrap;color:var(--mut)}
.sci{font-style:italic;font-weight:600}.mut{color:var(--mut);font-size:.85rem}
tr.attn td:first-child{border-left:4px solid #d4a017}
a{color:inherit}
.note{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:8px 14px;margin-bottom:16px;white-space:pre-wrap}
"""


def _flag_html(f: str) -> str:
    cls = "info" if f == FLAG_ESTIMATED else ("bad" if f.startswith(("geen GPS", "geen match")) else "")
    return f'<span class="flag {cls}">{escape(f)}</span>'


def build_html(res: Result, notes_raw: str = "") -> str:
    n_photos = len(res.photos)
    n_gps = sum(1 for p in res.photos if p.meta.has_gps and not p.meta.pos_estimated)
    n_species = len(res.species_slugs())
    n_attn = attention_count(res)
    rows = []
    for p in res.photos:
        m = p.meta
        t = m.taken.strftime("%d-%m-%Y %H:%M:%S") if m.taken else "onbekend"
        if m.has_gps:
            pos = f'<a href="{osm_link(m.lat, m.lon)}" target="_blank" rel="noopener">{m.lat:.5f}, {m.lon:.5f}</a>'
            pos += ' <span class="mut">(geschat)</span>' if m.pos_estimated else ""
        else:
            pos = '<span class="mut">geen positie</span>'
        place = res.places[p.cluster].id if p.cluster is not None else ""
        zone = res.places[p.cluster].zone_id if p.cluster is not None else ""
        pos += f'<div class="mut">{escape(place)}{(" · " + escape(zone)) if zone else ""}</div>'
        text = p.ocr.text.strip()
        ocr_html = f'<div class="ocr">{escape(text) or "(geen tekst)"}</div><div class="mut">zekerheid {p.ocr.confidence:.0f}%</div>'
        if p.matches:
            parts = []
            for mt in p.matches:
                alts = ", ".join(f"{escape(s)} ({sc:g})" for s, sc in mt.alternatives)
                parts.append(
                    f'<div><span class="sci">{escape(mt.sci)}</span> {escape(mt.name_nl or "")}'
                    f' <b>{mt.score:g}</b> <span class="mut">({escape(mt.via)})</span>'
                    + (f'<div class="mut">alternatieven: {alts}</div>' if alts else "")
                    + "</div>"
                )
            match_html = "".join(parts)
        else:
            match_html = f'<span class="mut">{escape(p.kind)}</span>'
        flags = "".join(_flag_html(f) for f in p.flags)
        note = f'<div class="mut">notitie: {escape(p.note)}</div>' if p.note else ""
        thumb = thumbnail_data_uri(m.path)
        img = f'<img src="{thumb}" alt="{escape(m.path.name)}">' if thumb else ""
        rows.append(
            f'<tr class="{"attn" if p.flags else ""}"><td class="img">{img}<div class="mut">{escape(m.path.name)}</div></td>'
            f"<td>{t}</td><td>{pos}</td><td>{ocr_html}</td><td>{match_html}</td><td>{flags}{note}</td></tr>"
        )
    notes_html = f'<div class="note"><b>notities.txt</b>\n{escape(notes_raw.strip())}</div>' if notes_raw.strip() else ""
    now = datetime.now().strftime("%d-%m-%Y %H:%M")
    return f"""<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Controlelijst veldwerk</title><style>{CSS}</style></head><body>
<h1>Controlelijst veldwerk</h1>
<p class="sub">Gemaakt op {now}. Werkmateriaal: niet publiceren. Vul de kolom <code>correctie</code> in controlelijst.csv in en draai daarna <code>apply</code>.</p>
<div class="sum">
<div><b>{n_photos}</b>foto's</div><div><b>{n_gps}</b>met GPS</div>
<div><b>{n_species}</b>soorten gevonden</div><div><b>{len(res.places)}</b>plekken</div>
<div><b>{n_attn}</b>vragen aandacht</div></div>
{notes_html}
<table><thead><tr><th>Foto</th><th>Tijd</th><th>Positie</th><th>OCR-tekst</th><th>Beste match</th><th>Opmerkingen</th></tr></thead>
<tbody>{"".join(rows)}</tbody></table></body></html>
"""


def write_html(path: Path, res: Result, notes_raw: str = "") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(build_html(res, notes_raw), encoding="utf-8")
