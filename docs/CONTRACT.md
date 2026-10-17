# Datacontract parkpakket (fase 0)

Bindend voor app (TypeScript), validatie (JSON-schema) en pipeline (Python). Wijzigen = hier eerst.

## Mappen
```
parks/avifauna/           parkpakket (alles parkspecifiek)
  park.json
  species.csv
  places.geojson
  expeditions.yaml
  programme.json
  texts/nl/<slug>.md      texts/en/<slug>.md
  facts/<slug>.yaml       eigen feiten + bronnen (fase 1; type Facts in src/data/types.ts)
  data/app-data.<taal>.json  goud, gepubliceerd door avipipe (fase 1)
  media/attributions.json
  map/                    OSM-afgeleid, ODbL (apart gehouden)
parks/schema/             JSON-schema's (park-onafhankelijk)
pipeline/                 Python; data/bronze (gitignored), data/silver, data/gold
build-cache/              NC-audio en andere niet-repo media (gitignored)
```

## Identifiers
- `slug`: wetenschappelijke naam, lowercase, spatie → `-` (bv. `spheniscus-humboldti`). Sleutel tussen alle bestanden.
- `zone_id`, `place_id`: kebab-case, uniek binnen het park (bv. `zone-tropenhal`, `verblijf-pinguins`).

## species.csv (UTF-8, komma, header verplicht)
| kolom | verplicht | type |
|---|---|---|
| scientific_name | ja | string, binomiaal |
| slug | ja | zie boven |
| name_nl | nee | zoals op bordje |
| zone_id | nee | verwijst naar places.geojson (kind=zone) |
| place_id | nee | verwijst naar places.geojson (kind=enclosure) |
| last_seen | nee | YYYY-MM-DD |
| wikidata_qid | nee | `Q\d+` |
| status | ja | `confirmed` \| `draft` \| `absent` |
| notes | nee | vrije tekst |

## places.geojson
FeatureCollection, WGS84. `properties`:
- `id` (verplicht), `kind`: `zone` (Polygon) \| `enclosure` (Point/Polygon) \| `facility` (Point) \| `anchor` (Point, in-/uitgang binnenruimte)
- `name_nl` (verplicht), `name_en` (optioneel), `zone_id` (optioneel, voor niet-zones)
- `facility_type` (alleen facility): `toilet` `baby_change` `food` `water` `playground` `picnic` `show` `feeding` `entrance` `exit` `first_aid` `info` `shelter`
- `indoor` (bool, optioneel), `source`: `veldwerk` \| `osm` \| `manual`, `last_seen` (YYYY-MM-DD, optioneel)

## media/attributions.json
Array van records, één per mediabestand:
```json
{
  "file": "media/photos/spheniscus-humboldti.webp",
  "slug": "spheniscus-humboldti",
  "kind": "photo | audio | model",
  "source": "wikimedia-commons | xeno-canto | own",
  "source_url": "https://...",
  "creator": "Naam",
  "license": "CC0-1.0 | PDM | CC-BY-4.0 | CC-BY-SA-4.0 | CC-BY-NC-SA-4.0 | ...",
  "license_url": "https://creativecommons.org/...",
  "title": "Bestandstitel",
  "retrieved": "2026-10-17",
  "modified": "trimmed to 8 s, mono, Opus 32 kbps",
  "in_repo": true
}
```
Regels: licentie alleen CC0 / PD(M) / CC-BY-* / CC-BY-SA-*; uitzondering CC-BY-NC-SA-* voor xeno-canto-audio, dan `in_repo: false` en het bestand staat in `build-cache/`. Nooit `-ND-`. Bewerkt fragment houdt de licentie van het origineel.

## Goud: app-data.<taal>.json
`{ "park": {...uit park.json}, "generated": ISO, "species": [ { slug, scientific_name, name, name_alt, order, family, iucn: "LC|NT|VU|EN|CR|EW|EX|DD|NE", wingspan_cm, mass_g, lifespan_y, zone_id, place_id, last_seen, photo: {file, attribution_index}, audio: [{file, attribution_index}], links: {wikipedia, xeno_canto, wikidata} } ] }`
Ontbrekende waarden: `null`, nooit weglaten.

## Fase 1-aanvullingen
- `facts/<slug>.yaml`: velden en betekenis als `Facts` in `src/data/types.ts`; schema `parks/schema/facts.schema.json`. Ranges als `[min, max]`; onbekend = `null` of `[]`. Altijd `sources` (≥ 1) en `reviewed`.
- `park.json` optioneel `analytics: { "umami": { "host_url": "https://…", "website_id": "<uuid>" | null } }`; env `VITE_UMAMI_HOST`/`VITE_UMAMI_WEBSITE_ID` gaat voor.
- `park.json` optioneel `links.species_page_template` (bv. `https://www.avifauna.nl/onze-dieren/{slug}/`) is níet nodig: parklinks per soort staan in `species.csv` kolom `park_url` (optioneel, fase 1).
- De app leest geen goud uit `pipeline/`, alleen uit `parks/<park>/data/`. Bundelformaat: `ParkBundle` in `src/data/types.ts`, zie `docs/FASE-1.md`.
