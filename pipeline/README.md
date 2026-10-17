# Datapijplijn (`pipeline/`)

Python-pakket `avipipe`: haalt open data op (Wikidata, Wikimedia Commons, xeno-canto) en maakt de `app-data.<taal>.json` volgens `docs/CONTRACT.md`.

## Draaien

Vanuit `pipeline/` (Python 3.12-venv in `D:\Avifauna\.venv`):

```
..\.venv\Scripts\python -m avipipe run --input proeflijst.csv --out data/proef --media-dir ../build-cache/proef/media
..\.venv\Scripts\python -m pytest avipipe        # tests, geen netwerk
```

Publiceren naar het parkpakket (fase 1):

```
..\.venv\Scripts\python -m avipipe run --input ../parks/avifauna/species.csv --out <werkmap> --media-dir <werkmap>/media --nc-dir ../build-cache/audio --publish ../parks/avifauna
```

`--publish <parkdir>` kopieert goud naar `<parkdir>/data/app-data.<taal>.json`, alle `in_repo`-media (foto's groot + thumb, BY-SA/CC0-audio) naar `<parkdir>/media/photos|audio/` en schrijft `<parkdir>/media/attributions.json` (volledige lijst, zodat `attribution_index` klopt). NC-audio (`in_repo: false`) blijft in `--nc-dir` (goud-pad `build-cache/audio/<slug>.opus`). Env `AVIPIPE_CACHE_DIR` verwijst naar een bestaande HTTP-cache (bv. die van een andere checkout). Kies `--out`/`--media-dir` buiten de repo of in een gitignorede map.

Datakwaliteit: Wikidata-waarden met spreiding max/min > 2,5 (bv. aasgier `mass_g` 94-1977) worden `null` in goud en staan in het rapport onder `spread_nulled`.

Opties: `--steps wikidata,photos,audio,gold` (subset), `--skip-audio`, `--skip-photos`, `--refresh` (HTTP-cache negeren), `--nc-dir` (standaard `build-cache/audio`), `--park <park.json>`.

Invoer: CSV met minimaal `scientific_name`; optioneel `name_nl`, `slug`, `zone_id`, `place_id`, `last_seen`, `notes` (extra kolommen zoals `park_url`, `status` en `wikidata_qid` worden genegeerd; zelfde kolommen als `species.csv`).

Benodigd: `XENO_CANTO_API_KEY` in `.env` in de repo-root (zonder sleutel wordt alleen de audiostap overgeslagen, exitcode 0) en `ffmpeg` (env `FFMPEG`, of op PATH, of de winget-installatie wordt automatisch gevonden).

## Lagen

| Laag | Map | Inhoud |
|---|---|---|
| Brons | `<out>/bronze/` | ruwe API-antwoorden (JSON); niet in git |
| Zilver | `<out>/silver/` | `species.json` (opgeschoonde soorttabel, incl. afgewezen foto's) en `attributions.json` (contractformaat) |
| Goud | `<out>/gold/` | `app-data.nl.json`, `app-data.en.json`, `ATTRIBUTIONS.md` |
| Media | `--media-dir` | `photos/<slug>.webp` (1200 px) en `-thumb.webp` (400 px); `audio/<slug>.opus` en `.m4a` |
| Cache | `pipeline/data/cache/` | HTTP-antwoorden en downloads; niet in git |

Ontbrekende waarden zijn `null`, nooit weggelaten. Elk mediabestand (ook thumbs, opus en m4a) heeft een eigen attributierecord; `attribution_index` in goud verwijst naar de plek in `attributions.json`.

## Keuzes in de data

- Koppeling via P225 (wetenschappelijke naam); geen exacte match: zoekfallback via `wbsearchentities`, en melding in het rapport (`unmatched`, `search_matched`).
- Spanwijdte (P2050), gewicht (P2067), levensduur (P2250): omgezet naar cm / g / jaar; meerdere waarden (bv. per geslacht) worden gemiddeld, met min/max/n in zilver. Onbekende eenheden en onwaarschijnlijke waarden worden genegeerd. Wikidata-waarden blijven ruwe aanwijzingen: controleer ze handmatig voor je ze publiceert.
- IUCN alleen via Wikidata P141 (nooit de IUCN-API).
- Orde en familie: ouderketen (P171) via de Wikidata-entity-API.

## Licentieregels

- Foto's (Commons): alleen CC0, PD/PDM, CC BY, CC BY-SA. Alles anders (NC, ND, GFDL-only, fair use, onbekend) wordt afgewezen en vastgelegd in zilver (`photo_rejected`). Eerst de P18-foto, dan bestanden uit de Commons-categorie.
- Geluid (xeno-canto): alleen kwaliteit A/B, ≤ 60 s en exact BY-SA, CC0/PD of BY-NC-SA. Nooit ND, nooit BY-NC zonder SA, nooit BY.
- BY-NC-SA-fragmenten gaan uitsluitend naar `build-cache/audio/` (`in_repo: false`); BY-SA/CC0 mogen naar `--media-dir/audio` (`in_repo: true`). Een bewerkt fragment houdt de licentie van het origineel.
- Een mislukte of verdwenen opname laat de build niet falen: loggen en doorgaan.
- Alleen gebouwd voor niet-commercieel gebruik: geen advertenties of betaalde functies in de app.
