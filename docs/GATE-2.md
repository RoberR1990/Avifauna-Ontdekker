# Gate 2: rapport fase 2 (spel, 17-10-2026)

Ontwerp: `docs/FASE-2.md`. Live: https://vogel-ontdekker-proto.pages.dev

## Afronding fase 1
- Gewone plataan: CC0-illustratie (Larousse 1932, Commons), met attributie. Pipeline-fix: zoekfallback accepteert nu ook hybriden (nothosoort).
- Taal en peuterstand: weg van Start en de kopbalk; klein menu rechtsboven (🌐 NL) met taal, peuterstand, Over en Bronnen.

## Wat staat er (fase 2)
- **Onderbalk**: Start · Atlas · Kaart · Spelen · Album. Start: tegel Spelen, "Ga verder met je expeditie", "Vandaag gezien", programmastrook.
- **Expedities (D)** `/spelen`, `/expeditie/:id`: 3 stuks (Vogels uit Afrika, Trekvogels en ganzen (1-10 t/m 30-11), Kleurenjacht). Stop opent via GPS in de **zone** (rand + nauwkeurigheid ≤ 25 m), alleen na "Zoek mijn plek"; locatie nergens bewaard. Binnen (Tropenhal): geen GPS, de vraag is het bewijs. Zonder GPS: "Ik sta er". Badge bij voltooien. Alleen `confirmed` soorten (validator dwingt af).
- **Bingo (E)** `/bingo`: 3×3 of 4×4, nieuwe kaart per dag, 60% soorten / 40% gedrag (24 gedragsvakjes); soortvakje = ook sticker; lijn = viering; volle kaart = badge.
- **Album en badges (F)** `/album`: stickerraster (geen spoilers), 6 app-badges + expeditiebadges, "Gezien!" op elke soortpagina. Alleen lokaal (IndexedDB). Back-up als bestand (samenvoegen, nooit overschrijven), afbeelding (PNG) en printen, beide mét fotobronnen.
- **Vandaag-kaartje (G)** `/vandaag`: PNG 1080×1350 op het toestel, met favoriet, badges en fotoattributie; delen of opslaan.
- **Dagprogramma (L)**: strook "Straks in het park" + herinnering zolang de app open is. **Staat uit: `programme.json` is leeg** (tijden niet van avifauna.nl overnemen).
- **Routes (M)** `/routes`, `/kaart?route=`: kinderwagen (1,6 km, 52 min), regen (1,3 km, 40 min), kort met peuter (0,8 km, 31 min), berekend over het OSM-padennet; label "concept".
- **Techniek**: Preact/compat i.p.v. react-dom (kern-JS 277 → 80 kB).

## Getest
- Vitest 308 · Playwright 66 (Pixel 7 + iPhone): o.a. expeditie met nep-GPS (buiten → op slot, in zone → open), binnen-stop, bingo → album, Gezien! → back-up maken/terugzetten → vandaag-PNG, route op de kaart, kopmenu.
- Lighthouse mobiel 4G (mediaan van 3): Start 97 / LCP 2,1 s · Atlas 96 / 2,5 s · Soort 96 / 2,6 s.
- validate:park GOED, kern 1,7 MB / 5 MB.

## Te controleren door Robert (in het park)
1. **Tropenhal-stop** ("Hoe voelt de lucht?") is algemene kennis, geen bordje. Graag een foto van een bord/inrichting in de Tropenhal → betere vraag.
2. **Kleurvragen** (struisvogel zwart-wit, helmparelhoen blauwe kop, Rüppells gier bruin, aasgier wit, rode panda roodbruin, roodhalsgans rood): klopt het met wat je ziet?
3. **Zones**: struisvogel/kroonkraanvogel (verblijf-001 net buiten de zones → zone-ingang), gieren (zone-zuidoost i.p.v. Gierenvallei), brandgans-GPS buiten het park.
4. **Routes lopen**: geen trappen/grind op de kinderwagenroute? Cuba-volière en restaurant echt overdekt?
5. **Programmatijden**: foto van het bord met voedertijden → `programme.json`.

## Veldtest 2 (met 2–3 gezinnen): wat meten
- Hoe lang spelen kinderen (stopwatch); maken ze een expeditie af; welke opdracht haken ze op af?
- Opent de stop op de juiste plek (GPS)? Hoe vaak is "Ik sta er" nodig?
- Bingo: 3×3 of 4×4; lukt een lijn binnen een bezoek?
- Album/kaartje: willen ze het bewaren of delen? Willen ze terugkomen?

## Open / besluiten
- Umami-website-ID (events zijn stubs), domein, merkcheck.
- Veldwerk: geen nieuwe foto's na 17-10 (alles verwerkt).
- Fase 3 pas na jouw akkoord.
