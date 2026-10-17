# Gate 1: rapport fase 1 (alfa, 17-10-2026)

## Wat staat er
- **Vogelatlas** (`/atlas`): 35 soorten, zoeken (NL/EN/Latijn, zonder accenten), filters werelddeel, kleur, grootte, zone, IUCN; filterstand in de URL.
- **Soortpagina** (`/soort/:slug`): drie niveaus (onthouden), voorlezen, Vogel-o-meter, herkomstkaartje met afstand, geluid (15+ soorten), "Hier in het park" met link naar de kaart, feitenblok (kenner, expeditiekaart-stijl), attributie onder elke foto en elk geluid, label "concepttekst".
- **Bronnenpagina** (`/bronnen`): alle attributies per soort.
- **Parkkaart** (`/kaart`): OSM-kaart + 9 concept-zones, verblijven (tik → soorten), 13 soorten voorzieningen, pinch-zoom, `?plek=`, GPS-stip alleen op het toestel; buiten het park een melding.
- **Peuterstand** (`/peuter`): grote foto's, naam voorgelezen, geluid; "Klaar" 1 s ingedrukt houden.
- **NL/EN**: taalkiezer; NL- en EN-teksten (kind, b1, kenner) voor alle 34 dieren + plataan; allemaal `reviewed: false`.
- **Offline**: kern 1,6 MB (limiet 5 MB) direct; foto's en geluid in de achtergrond; knop "Download alles voor offline".
- **Data**: 35 soorten (20 `confirmed` uit veldwerk 17-10, 15 `draft` uit de proeflijst), 64 plekken (zones, verblijven, voorzieningen), 122 attributies; feiten met bronnen per soort.

## Wat werkt (getest)
- Vitest 148 tests, Playwright 52 tests (Pixel 7 + iPhone-viewport): offline, atlas, soortpagina, kaart met nep-GPS, peuter, taal, bronnen, installeerbaarheid.
- Lighthouse mobiel 4G (mediaan van 3): Start 97 / LCP 2,4 s · Atlas 94 / 2,9 s · Soortpagina 94 / 2,8 s.
- Vogel-o-meter gecontroleerd voor alle 35 soorten (o.a. pinguïn "bijna zo lang als een kind van 1", nooit "kind van 3").

## Wat (nog) niet
- **Statistieken (Umami)**: events zijn stubs; wacht op website-ID. Privacytekst nog niet bijgewerkt.
- **Hosting**: live op https://vogel-ontdekker-proto.pages.dev (Cloudflare Pages, `noindex`; neutrale naam tot toestemming). Opnieuw publiceren: `pnpm deploy` (wrangler-login nodig).
- **Soortenlijst**: 35 van ~200 soorten (veldwerk dekte ~1 uur). Atlas-LCP heeft weinig marge (2,9 s).
- **Zones** zijn grove concepten uit OSM; veldwerkplekken liggen soms samen door GPS-onnauwkeurigheid (bv. rode panda, emoe, ekstergans, plataan op één plek).
- Gewone plataan heeft geen foto en geen Vogel-o-meter.
- Geen programma-items (voedertijden) in `programme.json`.

## Te controleren door Robert
1. **Teksten en feiten** (70 teksten + 35 feitenbestanden, `reviewed: false`). Bekende twijfels:
   - IUCN/trend: rode panda (EN of VU), kroeskoppelikaan (NT of VU), grijze kroonkraanvogel (EN of VU).
   - Maten: schildpad (maxima), emoe-gewicht 18–60 kg (breed), reiger/ooievaar (ADW onbetrouwbaar, Wikipedia gebruikt).
   - Regenbooglori: soort onbekend (bord noemt alleen Loriidae); rode flamingo: welke soort in het park?
   - Uiterlijk van kwak, helmparelhoen en secretarisvogel komt uit algemene kennis, niet uit een bron.
2. **Referentiewaarden** Vogel-o-meter (WHO-kindermaten, CBS-volwassene) in `src/features/meter/compare.ts`.
3. **Kaart**: zones en plekken (`parks/avifauna/map/places.preview.png`, of in de app onder Kaart).

## Veldtest met de kinderen: wat te testen
- **Laden**: open de app thuis op wifi; wacht tot "alles offline beschikbaar" (Over/Start). In het park de vliegtuigstand aan: werkt alles nog?
- **GPS**: zet "Waar ben ik?" aan bij 3–4 bekende plekken (ingang, pinguïns, Tropenhal-ingang, gieren). Klopt de stip? Hoeveel meter ernaast?
- **Kinderen**: welk niveau kiezen ze; snappen ze de Vogel-o-meter; drukken ze op "Lees voor"; werkt het geluid (ook op iPhone in de peuterstand); waar haken ze af (stopwatch: hoe lang blijven ze erbij)?
- **Peuterstand**: komen ze er per ongeluk uit? Zijn de foto's groot genoeg?
- **Soortenlijst aanvullen**: fotografeer elk bordje dat nog ontbreekt (vooral Tropenhal, Lori Landing, uilen, papegaaien), plus voorzieningen (toiletten, babyverschoning, kiosken). Twee foto's per bord helpt bij slecht licht.
- **Snelheid**: opent een soortpagina binnen 3 s op 4G?

## Besluiten nodig voor de veldtest
- **Domein**: later kiezen (nu `vogel-ontdekker-proto.pages.dev`).
- **Umami-website-ID** (Cloud EU).
