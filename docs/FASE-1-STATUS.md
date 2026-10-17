# Fase 1: stand van zaken (17-10-2026, overdracht naar volgende sessie)

> **Update eind 17-10:** wave B en C klaar; veldwerk 17-10 toegepast (35 soorten). Actuele stand, open punten en veldtestplan: **`docs/GATE-1.md`**. Wacht op: Umami-ID, hostingbesluit, review teksten, tweede veldwerkbezoek.
> Nieuw veldwerk verwerken: (1) `python -m veldwerk run --input D:\Avifauna\veldwerk --output D:\Avifauna\veldwerk\uitvoer`; (2) bordjes visueel laten lezen door een agent → `controlelijst-voorstel.csv`; (3) na akkoord `python -m veldwerk apply --csv ...\controlelijst.csv --park ../parks/avifauna`; (4) avipipe `--publish` (pipeline/README.md); (5) facts + teksten nl/en voor nieuwe soorten.

Lees bij hervatten alleen dit bestand + `docs/FASE-1.md` (ontwerp) + `src/data/types.ts`. Alles hieronder staat op `main`.

## Klaar (wave A, alles groen: typecheck, 94 tests, validate:park, build, kern 1,4 MB / 5 MB)
- **Data:** `species.csv` = 21 soorten van de proeflijst (draft, `park_url`); goud in `parks/avifauna/data/`, 21 foto's in `media/photos/`, attributies in `media/attributions.json`. Audio: flamingo in repo (BY-SA), 14 soorten NC in `D:\Avifauna\build-cache\audio` (niet in git); 6 soorten zonder audio. Pipeline: `--publish <parkdir>`, Wikidata-waarden met spreiding > 2,5 → null.
- **Kaart:** `python -m osm places` → `places.geojson` (9 concept-zones, 17 verblijven, 8 voorzieningen, 3 ankers), `map/places.preview.png`, `map/species-places.concept.csv`; 12 soorten hebben een concept-plek in `species.csv`.
- **Feiten + teksten:** `parks/avifauna/facts/<slug>.yaml` en `texts/nl/<slug>.md` (kind, b1, kenner) voor alle 21, `reviewed: false`. Alleen NL.
- **Validator:** facts-schema, `park_url`, `park.json analytics.umami`.
- **Vogel-o-meter:** `src/features/meter/` (`compareSpecies`, `<BirdOMeter species lang card?>`), getest (pinguïn → "bijna zo lang als een kind van 1").
- **Herkomstkaartje:** `src/features/origin/` (`<OriginMap species lang parkCenter parkName?>`, Natural Earth 110m).
- **Fundament:** `scripts/park-build/` (bundel + Vite-plugin, `pnpm build:park`), Workbox kern/`park-media`, `check:core`, eigen lettertypen (fontsource), ontwerpsysteem `src/styles.css` (klassen: `.btn`, `.card`+`.c-v/.c-r/.c-s/.c-t`, `.levels`, `.badge[data-iucn]`, `.chip`, `.input`, `dl.facts`, `.wow`, `.kidtext`, `.tiles`; kenner-thema via `.species-page` + `html[data-level=kenner]`), `useSettings`, `useT`/`makeT`, `ParkDataProvider` (`useBundle`, `useSpecies`, `usePlace`, `mediaUrl`), `lib/speech.ts`, `lib/geo.ts`, `offline/prefetch.ts` + `<OfflineDownloadButton onStart?>`, Layout met taalkiezer, peuterknop en onderbalk, Home met Vogel van de dag. Placeholders: `AtlasPage`, `SpeciesPage`, `ParkMapPage`, `ToddlerPage`, `SourcesPage` in `src/features/<f>/`.

## Nog te doen (wave B, parallel per map; daarna wave C)
1. **Atlas** `src/features/atlas/`: kaarten (thumb, naam, IUCN-badge), zoeken (naam NL/EN/Latijn), filters werelddeel/kleur/grootte (`size_class`)/zone/IUCN; event `filter_use` (zonder zoektekst).
2. **Soortpagina** `src/features/species/`: FASE-1 §5; niveaukeuze bovenaan, voorleesknop, `<BirdOMeter>`, `<OriginMap>` (parkCenter = `park.center` of zwaartepunt van de zones), geluid (opus + m4a-fallback) met attributie, attributie onder de foto, "Hier in het park" (link `/kaart?plek=<id>`), feitenblok kenner, label "concepttekst".
3. **Bronnenpagina** `src/features/sources/` uit `bundle.attributions`.
4. **Parkkaart** `src/features/map/`: `park/map/map-base.svg` + zones/voorzieningen-overlay, GPS-stip alleen lokaal (`gpsToSvg`), knop aan/uit, buiten-het-park-melding, highlight via `?plek=`.
5. **Peuterstand** `src/features/toddler/`: groot fotoraster, tik → grote foto + naam voorlezen + geluid.
6. **Statistieken** `src/lib/track.ts` volgens FASE-1 §6 + aansluiten op alle events + Over-pagina (privacytekst, opt-out). Wacht op website-ID van Robert (zonder ID staat het uit).
7. **Wave C:** Playwright (offline, atlas, soortpagina, kaart met nep-GPS, peuter, taal), Lighthouse-script (`pnpm lighthouse`, mobiel 4G, ≥ 90), review door het zware model, gate-1-rapport.

## Besluiten na wave A
- **EN-teksten: ja** (17-10-2026). Wave B: `texts/en/<slug>.md` voor alle 21 (kind, b1, kenner), eigen tekst, `reviewed: false`.
- Voorlopige preview: `AtlasPage` (lijst) en `SpeciesPage` (foto, Vogel-o-meter, herkomstkaartje) zijn tijdelijk bedraad; `park.json` heeft nu `center` en `map_georef`. Bekijken: `pnpm build` + `pnpm exec vite preview --host --port 4173` (`.claude/launch.json` → preview).
- Kleine bevinding: naam toont "Humboldt pinguïn" (uit proeflijst/csv); `name_nl` in species.csv opschonen naar de gangbare spelling.

## Wacht op Robert
- Veldwerkfoto's in `D:\Avifauna\veldwerk\` (stap 0: `run` → controlelijst.html → correcties → `apply` → avipipe `--publish`).
- Umami-website-ID (Cloud EU).
- Review feiten/teksten (`reviewed: false`). Bekende twijfels: kroonkraanvogel (regulorum/pavonina), regenbooglori (1 bron), rode brulaap (identiteit), flamingo-soort, rode panda EN/VU, kroeskoppelikaan NT/VU, schildpadmaten zijn maxima; WHO/CBS-referentiewaarden in `compare.ts` nog tegen de tabellen controleren.
- Concept-zones en soort→verblijf (preview `map/places.preview.png`); expeditiestop flamingo staat op `zone-grote-vijver`.

## Werkwijze
- Worktree `D:\Avifauna\.claude\worktrees\avifauna-fase-1-mvp-82be39`, branch → push met `git push origin HEAD:main`.
- `.env` (xeno-canto-sleutel) staat ook in de worktree-root (gitignored). Venv: `D:\Avifauna\.venv`. pnpm 12 (`pnpm-workspace.yaml` staat esbuild/sharp toe).
