# Fase 1 (MVP): technisch ontwerp

Bindend voor alle bouwwerk in fase 1. Leidend daarnaast: `CLAUDE.md`, `PLAN.md` §5/§6/§8, `docs/CONTRACT.md`, `docs/GATE-0.md`.
Datatypes app ↔ build: `src/data/types.ts`.

## 1. Datastroom

```
pipeline (avipipe)  ──publish──►  parks/avifauna/data/app-data.<taal>.json   (goud, in git)
                                   parks/avifauna/media/photos/*.webp        (alleen in_repo: true)
                                   parks/avifauna/media/attributions.json
build-cache/audio/*.opus|m4a  (NC, nooit in git; pad via env AVIFAUNA_BUILD_CACHE, standaard <repo>/build-cache)
parks/avifauna/facts/<slug>.yaml   eigen feiten + bronnen (reviewed: false)
parks/avifauna/texts/<taal>/<slug>.md
parks/avifauna/places.geojson, programme.json, park.json, map/
        │
        ▼  scripts/park-build/ (Vite-plugin `parkData()`, ook los: `pnpm build:park`)
dist/park/data.<taal>.json   (ParkBundle)        ── precache (kern)
dist/park/media/photos/<slug>-thumb.webp          ── precache (kern)
dist/park/media/photos/<slug>.webp                ── runtime-cache "park-media"
dist/park/media/audio/<slug>.opus|.m4a            ── runtime-cache "park-media"
dist/park/map/map-base.svg                        ── precache (kern)
```
- In dev serveert de plugin `/park/*` via middleware (zelfde paden).
- Ontbrekende bronbestanden (geen facts, geen tekst, geen audio) zijn geen fout: veld `null`.
- Alleen soorten met `status != absent` komen in de bundel.
- Audio in de bundel alleen als het bestand echt bestaat (in build-cache of media/).

## 2. Kern ≤ 5 MB, daarna parkpakket (PLAN §8)
- Precache (Workbox): app-shell, js/css, lettertypen (woff2, alleen latin), iconen, `park/data.*.json`, thumbs, kaart-SVG. Budget-test: `scripts/check-core-size.ts` faalt bij > 5 MB.
- Runtime-cache `park-media` (CacheFirst, max 2000 items) voor grote foto's en audio.
- `src/offline/prefetch.ts`: na de eerste load (idle, ná `serviceWorker.ready`) haalt de app `media_manifest` op in de achtergrond, tenzij `navigator.connection.saveData` of `effectiveType` 2g/slow-2g. Knop "Download alles voor offline" (Over-pagina en Home) met voortgang; status "alles offline beschikbaar" wanneer klaar (controle via `caches.match`).

## 3. App-structuur
```
src/
  data/types.ts            contract (hierboven)
  data/ParkDataProvider.tsx  laadt park/data.<lang>.json, context + hooks useParkData(), useSpecies(slug)
  state/settings.ts        level, lang, toddler, trackingOptOut (localStorage, sleutel "ao-settings"); useSettings()
  i18n/                    t(key) uit nl.ts/en.ts; per feature eigen woordenboek: src/features/<f>/i18n.ts ({nl,en})
  lib/track.ts             Umami (zie §6)
  lib/speech.ts            voorlezen (speechSynthesis, taal nl-NL/en-GB, rate kind 0.85)
  lib/geo.ts               affine GPS→SVG, haversine
  offline/prefetch.ts
  features/atlas/          AtlasPage, filters, zoeken
  features/species/        SpeciesPage + secties
  features/meter/          Vogel-o-meter: compare.ts (puur, getest) + BirdOMeter.tsx
  features/origin/         wereldkaartje (continenten) + afstand tot het park
  features/map/            ParkMapPage
  features/toddler/        ToddlerPage
  features/sources/        SourcesPage (uit attributions)
  pages/                   Home, About, NotFound
```
Routes: `/` · `/atlas` · `/soort/:slug` · `/kaart` · `/peuter` · `/bronnen` · `/over`.

## 4. Ontwerpsysteem
- Basis: `design/voorstellen/2-stickerboek.html` (tokens: `--bg #fff1d0`, `--ink #231942`, `--red #e8452f`, `--sun #ffc233`, `--teal #0f9d94`, `--violet #6a48d7`, `--pink #ff8fa3`, `--white #fffdf7`; fonts Fredoka (koppen) + Nunito (tekst); dikke inktranden, `box-shadow: 0 Npx 0 var(--ink)`, licht gedraaide kaarten, pilknoppen).
- Kenner-niveau (op de soortpagina, `data-level="kenner"` op `<html>`): dichtere stijl van `3-expeditiekaart.html`: ticketkaarten (cream op night `#2a1b4d`, goudkop met stippellijn, inkepingen), Abril Fatface + Josefin Sans, hoofdletterlabels, compact feitenblok (`dl`).
- Parkkleuren uit `park.json theme` overschrijven `--violet`/`--sun` niet; alleen manifest/theme-color.
- Lettertypen zelf gehost via `@fontsource(-variable)` (OFL), alleen latin-subset. Geen Google Fonts.
- Tikvlakken ≥ 48 px (kind-niveau/peuter ≥ 72 px). `prefers-reduced-motion` respecteren. Contrast WCAG AA.
- Vaste disclaimerbalk + footer blijven op elke pagina (ook peuterstand).

## 5. Inhoud per soort (PLAN §6)
- Leesniveau kiezen bovenaan (Kind / Iedereen / Kenner), onthouden in settings.
- Kind: `text.kind` + `facts.wow` + voorleesknop + "Gezien!" komt in fase 2 (nu niet).
- Iedereen: Vogel-o-meter, `text.b1` + voorlezen, Waar woont hij (wereldkaartje + km), Hoor hem (als audio), Hier in het park (zone/verblijf + link naar kaart; programma als items bestaan), Meer weten (feiten + Wikipedia).
- Kenner: feitenblok uit `facts` + goud (orde, familie, IUCN + trend, verspreiding, lengte, gewicht, spanwijdte, legsel, broedduur, voedsel, leeftijd, gevaren), `text.kenner` als die er is, links (xeno-canto, Wikipedia, Wikidata, park).
- Ontbreekt een waarde: rij weglaten of "onbekend"; nooit schatten.
- Ontbreekt de tekst in de gekozen taal: nl-tekst tonen met melding "(alleen in het Nederlands)". Geen tekst: alleen het feitenblok.
- Attributie direct onder elke foto en bij elk geluid: maker, licentie (link), bron (link), "bewerkt" indien `modified`.
- `reviewed: false` → klein label "Concepttekst, nog niet gecontroleerd".

## 6. Statistieken (Umami, GATE-0)
- Eigen kleine zender (`src/lib/track.ts`), geen extern script: `POST {host}/api/send` met `{type:'event', payload:{website, hostname, language, url, title:'', referrer:'', screen:'', name?, data?}}`.
- Config: `park.json analytics.umami {host_url, website_id}`; env `VITE_UMAMI_HOST` / `VITE_UMAMI_WEBSITE_ID` gaan voor. Geen website-id → uit.
- Uit bij: DNT (`navigator.doNotTrack === '1'`), GPC (`navigator.globalPrivacyControl`), opt-out in settings, offline (event gaat verloren), dev-modus.
- Vaste events (geen andere toegestaan, type-gecontroleerd): `pageview` (url = route, met soort-slug), `species_view {slug}`, `level_change {level}`, `filter_use {filter}`, `read_aloud {level}`, `sound_play {slug}`, `map_open`, `gps_toggle {on}`, `language_change {lang}`, `toddler_mode {on}`, `offline_download {}`. Nooit locatie, zone-uit-GPS, zoektekst of vrije tekst.
- Over-pagina: privacytekst (wat geteld wordt, Umami Cloud EU, geen cookies), opt-out-schakelaar.

## 7. Vogel-o-meter (`features/meter/compare.ts`)
- Invoer: `facts.length_cm`/`height_cm`/`mass_g`/`wingspan_cm`; Wikidata-waarde alleen als facts ontbreekt én `is_bird`.
- Vergelijkingsobjecten met vaste, onderbouwde maten (tabel in code, met bron in commentaar): lengte van kinderen per leeftijd (WHO-mediaan), volwassene, alledaagse dingen; gewicht in pakken melk (1 L ≈ 1 kg), appels, eieren; zware dieren: kinderen per leeftijd (WHO-mediaan gewicht), volwassene.
- Kies het referentieobject met de kleinste |ln(waarde/ref)|; formulering op basis van de verhouding: 0,9–1,1 "ongeveer zo … als", 0,75–0,9 "bijna zo … als", 1,1–1,35 "iets … dan", anders veelvoud ("zo zwaar als 4 pakken melk", afgerond op hele of halve). Midden van de range gebruiken; de echte range eronder tonen.
- Lengte = snavel tot staart: formulering "van snavel tot staart zo lang als …" (niet "zo groot als"), tenzij `height_cm` bestaat: dan "zo hoog als …".
- Unit-tests met echte soorten: pinguïn 56–70 cm → géén "kind van 3"; struisvogel; kolibrie-achtig klein; ontbrekende waarden → geen vergelijking.

## 8. Peuterstand en taal
- `/peuter`: raster van grote foto's (thumbs), tik → grote foto, naam voorgelezen, geluid als het er is. Geen tekst behalve de naam. Grote "terug"-knop. Schakelaar op Home en in de kopbalk.
- Taalkiezer NL/EN in de kopbalk; `<html lang>` volgt; bundel per taal.

## 9. Tests
- Vitest: compare.ts, geo.ts, track.ts (DNT/GPC/opt-out/whitelist), park-build (bundel uit fixtures), filters.
- Playwright (Pixel 7 + iPhone-viewport): offline, atlas (zoeken + filter), soortpagina (niveaus, attributie), kaart (render, GPS-stip met nep-locatie), peuterstand, taalwissel.
- Lighthouse (mobiel, 4G-throttling): performance ≥ 90, PWA-installeerbaar, LCP < 3 s. Script `pnpm lighthouse`.

## 10. Werkafspraken voor agents
- Alleen eigen paden stagen (`git add <paden>`), nooit `git add -A`. Niet pushen; de hoofdsessie pusht na controle.
- Commitberichten Nederlands, kort, eindigen met `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Geen parkspecifieke waarden in `src/` (alles via de bundel/park.json).
