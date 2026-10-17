# CLAUDE.md: Avifauna Ontdekker (onofficiële webapp voor Vogelpark Avifauna)

Lees eerst `PLAN.md` (volledig plan) en `PITCH-IDEEEN.md` (staat buiten de scope van de bouw; alleen voor later).

## Context
- Hobbyproject van Robert Riteco. Hij wil het later aanbieden aan Stichting Avifauna, open source maken (code MIT, eigen data CC BY 4.0) en tonen op zijn persoonlijke website.
- De gebruiker communiceert in het Nederlands, kort en direct. Hij wil gefaseerd werken met reviewmomenten (gates in PLAN.md §9). Ga niet door naar de volgende fase zonder akkoord.
- Kostenbewust: gebruik lichtere modellen of subagents voor uitvoerend werk (componenten, pipeline, tests) en bewaar het zware model voor ontwerp- en reviewbeslissingen.
- Bij een cruciale blokkade: stoppen en voorleggen, niet doorwerken op aannames.

## Harde regels
1. **Onofficieel.**
   - Naam: "Avifauna Ontdekker" (alleen in `park.json`, zodat hij makkelijk te wijzigen is).
   - Geen logo, huisstijl, teksten, foto's of plattegrond van avifauna.nl. Wel linken; de plattegrond alleen als referentie bij het natekenen.
   - Vaste balk bovenaan elke pagina: "Onofficieel prototype · gemaakt als voorstel voor Stichting Avifauna". Nooit suggereren dat Avifauna het steunt.
   - `noindex` tot de pitch.
   - De Over-pagina vermeldt: gebouwd door Robert Riteco als hobbyproject.
2. **Privacy.**
   - Geen accounts, cookies, tracking of server-opslag van gebruikersdata.
   - GPS alleen op het toestel; nooit opslaan of versturen.
   - Geen camerafuncties die beelden maken of versturen.
   - Statistieken alleen als dat bij gate 0 is besloten, en dan alleen cookieloos en geaggregeerd.
3. **Licenties.**
   - Media alleen CC0, PD, CC BY of CC BY-SA. Uitzondering: vogelgeluid van xeno-canto onder CC BY-NC-SA mag (de app is niet-commercieel), maar wordt pas bij het bouwen opgehaald en staat nooit in de repo. Bewerkte fragmenten krijgen dezelfde licentie. Nooit ND inkorten. Nooit IUCN-API-data, nooit content van avifauna.nl.
   - Geen advertenties, betaalde functies of andere inkomsten in de app; daarvan hangt de NC-licentie af.
   - Bij elk mediabestand hoort een attributie-record (bron, url, maker, SPDX-licentie, titel, ophaaldatum).
   - Wikipedia-tekst niet overnemen. Teksten zelf schrijven op basis van feiten, met bronnen, op drie niveaus: kind, B1 (standaard) en kenner. Het kennersniveau is vooral een feitenblok uit de data, plus één alinea voor de top-50.
4. **Offline-first.** De app moet volledig werken zonder netwerk nadat hij één keer is geladen.
5. **Parkpakket.** Alles wat specifiek is voor Avifauna staat in `parks/avifauna/`. Geen parkspecifieke waarden hardcoded in de componenten.

## Stack
- Vite + React + TypeScript; `vite-plugin-pwa`; IndexedDB via `idb-keyval`; eigen SVG-kaart met georeferentie (3 ijkpunten); `<model-viewer>` voor AR.
- Data-pipeline in Python (`pipeline/`): brons (ruwe dumps) → zilver (opgeschoonde soorttabel + attributies) → goud (`app-data.<taal>.json`).
- Tests: Vitest, Playwright (mobiele viewport), Lighthouse PWA ≥ 90.
- Hosting: Cloudflare Pages of GitHub Pages.
- UI-taal: Nederlands eerst, Engels als tweede taal.

## Waar te beginnen
Fase 0 uit PLAN.md §9:
1. Repo-skelet.
2. Types en JSON-schema van het parkpakket.
3. Veldwerk verwerken: de foto's in `veldwerk/` → GPS uit de foto-gegevens (EXIF) + tekstherkenning op de naambordjes → concept-`species.csv` en `places.geojson`. Robert controleert het resultaat. Zie `VELDWERK.md`.
4. Pipeline Wikidata → Commons voor die soortenlijst; kaartbasis uit OpenStreetMap.
5. 2–3 voorstellen voor de ontwerprichting.

Sluit af met gate 0.

## Open punten (nog niet besloten)
- Merkcheck "Avifauna" in BOIP.
- Statistieken ja/nee.
- Domein.
- Geluidsbronnen: zie PLAN.md §7.5.
