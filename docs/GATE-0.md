# Gate 0: besluiten (17-10-2026)

## Stand
- App-skelet (PWA, offline getest, vaste balk, Over, noindex), parkpakket-schema's + `pnpm validate:park`, pipeline `pipeline/avipipe` (proef: 21 soorten), veldwerk-script `pipeline/veldwerk`, OSM-kaartbasis `parks/avifauna/map/`, ontwerpvoorstellen `design/voorstellen/`.
- Veldwerk: Robert gaat 17-10-2026 's middags; foto's komen in `veldwerk/`.

## Besluiten
- **Ontwerp:** Stickerboek (`design/voorstellen/2-stickerboek.html`) als basis voor de app; voor het Kenner-niveau de dichtere stijl van Expeditiekaart (`3-expeditiekaart.html`: ticketkaarten, feitenblok).
- **Statistieken: ja, met Umami.** Owner wil diepgaande event-tracking (kliks, pagina's, featuregebruik). Randvoorwaarden (CLAUDE.md regel 2 blijft gelden):
  - Cookieloos, geen localStorage-ID, geen `identify()`, geen persoonsgegevens of vrije tekst in event-data, geen GPS/locatie in events (ook geen zone afgeleid uit GPS).
  - Events alleen met vaste namen en kleine, niet-herleidbare properties (bv. `species_slug`, `level`, `feature`).
  - Respecteer Do Not Track / Global Privacy Control; opt-out-knop op de Over-pagina.
  - Over-pagina noemt Umami en wat er geteld wordt.
  - Offline: events die offline vallen gaan verloren (geen eigen wachtrij) tenzij later anders besloten.
  - Hosting Umami (Cloud EU vs. zelf op de NAS) nog te kiezen.
- **Proeflijst-twijfels** (kroonkraanvogel, regenbooglori, rode brulaap): oplossen via het veldwerk (Latijnse naam op het bordje).

## Nog open
- Merkcheck "Avifauna" (BOIP), domein, mag je in het park geluid opnemen, Umami-hosting.
