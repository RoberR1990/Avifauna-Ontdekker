# Fase 2 (spel): technisch ontwerp

Bindend voor alle bouwwerk in fase 2. Leidend daarnaast: `CLAUDE.md`, `PLAN.md` §5 (D, E, F, G, L, M) en §9, `docs/FASE-1.md` (blijft gelden).
Contracten: `src/park/types.ts` (parkpakket), `src/data/types.ts` (bundel), `src/state/album.ts` (album-API).

## 1. Uitgangspunten
- **Alleen op het toestel.** Album, expeditievoortgang, bingo en badges staan in IndexedDB (`idb-keyval`, store `ao-album`). Geen server, geen accounts. GPS alleen in het geheugen, nooit opgeslagen (ook niet "in zone X geweest").
- **Opdrachten alleen met soorten `status: confirmed`.** Validator én build controleren dit (expedities, bingo).
- **Zoneniveau.** Een stop opent via GPS in de juiste **zone** (polygoon), nooit op verblijfniveau. Binnen (Tropenhal, `indoor`) geen GPS: de opdracht is het bewijs.
- **Parkpakket.** Alle inhoud (expedities, bingo-kaartjes, routes, programma) in `parks/avifauna/`; componenten bevatten geen parkspecifieke waarden.
- **Kern ≤ 5 MB, LCP < 3 s.** Alle nieuwe pagina's lazy. Het album-module laadt pas op pagina's die het nodig hebben (+ de "Gezien!"-knop in de soortpagina-chunk).
- **Peuterstand** krijgt geen spelfuncties.

## 2. Navigatie en routes
- Onderbalk: **Start · Atlas · Kaart · Spelen · Album**. "Over" en "Bronnen" verhuizen naar het kopmenu (naast taal en peuterstand) en blijven gelinkt onderaan Start.
- Routes (nieuw): `/spelen` (hub: expedities, bingo, routes) · `/expeditie/:id` · `/bingo` · `/album` · `/vandaag` (kaartje) · `/routes` · `/kaart?route=<id>` (route op de kaart).
- Start krijgt: strook **"Straks in het park"** (L), kaart **"Ga verder met je expeditie"** (als er een open expeditie is), knop **"Vandaag gezien"** (vanaf 1 sticker vandaag).

## 3. Parkpakket: nieuwe en uitgebreide bestanden

### 3.1 `expeditions.yaml` (bestaat; schema `expeditions.schema.json`)
Ongewijzigd formaat (zie `src/park/types.ts`), plus:
- `stop.title` (`LocalizedNl`, kort, bv. "Bij de gieren"); `expedition.age` (`'4-6' | '6-10' | 'all'`, optioneel); `expedition.minutes` (schatting).
- Opdrachttypen: `find` (zelf bevestigen), `look` (zelf bevestigen), `count` (getal; met `answer` = vaste waarde, zonder `answer` telt elk getal ≥ 0), `answer` (open tekst, niet gecontroleerd, niet opgeslagen; alleen "klaar"), `choose` (meerkeuze, `answer` = index, gecontroleerd).
- **Regel binnen (`indoor: true` of zone met `indoor: true`):** alleen `choose` of `count` mét `answer`, en het antwoord moet ter plekke te zien zijn (bordje, inrichting), niet uit algemene kennis. De validator dwingt type + `answer` af.
- **Regel buiten:** `count` zonder `answer` (dieren bewegen); `choose` alleen over vaste kenmerken (kleur, snavelvorm).
- Fout antwoord: hint tonen, opnieuw proberen; geen straf, geen score.
- `season` (MM-DD, mag over de jaargrens): buiten het seizoen staat de expeditie niet in de lijst.

### 3.2 `bingo.yaml` (nieuw; schema `bingo.schema.json`)
```yaml
sizes: [9, 16]            # 3x3 (standaard) en 4x4
species_share: 0.6        # deel soortvakjes
behaviours:               # gedrag- en dingen-vakjes
  - id: one-leg
    icon: "🦩"            # emoji; geen beeldmateriaal nodig
    label: { nl: "Vogel op één poot", en: "Bird on one leg" }
    indoor_ok: true
```
Soortvakjes: alle `confirmed` soorten met een foto en `is_bird`-feiten óf niet-vogel (dieren mogen; de plataan niet: `facts.is_bird === false` én geen dier → uitsluiten via `bingo.yaml exclude: [platanus-hispanica]`).

### 3.3 `routes.yaml` (nieuw; schema `routes.schema.json`)
```yaml
routes:
  - id: kinderwagen
    profile: stroller        # stroller | rain | all | short
    title: { nl: ..., en: ... }
    intro: { nl: ..., en: ... }
    waypoints: [voorziening-entrance-1, verblijf-humboldtpinguin, ...]   # place-id's, in volgorde
    note: { nl: ..., en: ... }   # optioneel (bv. "check altijd de borden")
```
- De build berekent de lijn over het padennetwerk uit `map/osm-extract.json` (Dijkstra, gewichten = meters). Profiel `stroller`: geen `highway=steps`, geen `surface` in {`sand`, `gravel`, `dirt`, `grass`} als er een alternatief is (strafgewicht ×5). `rain`: zelfde graaf; de auteur kiest waypoints langs overdekte plekken (`indoor`/`shelter`), de app toont welke stops overdekt zijn.
- Waypoints worden aan het dichtstbijzijnde knooppunt gekoppeld (centroid van de plek; max 60 m, anders build-waarschuwing en rechte lijn).
- Uitvoer in de bundel: SVG-polyline (kaartcoördinaten), lengte in m, looptijd (3 km/u, `short` 2,5 km/u, plus 2 min per stop).
- Routes zijn **concept** tot Robert ze heeft gelopen (label in de app).

### 3.4 `programme.json` (bestaat, leeg)
Formaat blijft. Tijden worden met de hand ingevoerd (veldwerk/bordjes of door Robert), **nooit overgenomen van avifauna.nl** (alleen gelinkt). Leeg = strook verborgen.

### 3.5 Afgeleide zones
Plekken zonder `zone_id` (veel veldwerkverblijven) krijgen in de build een zone via punt-in-polygoon (centroid). Dit voedt "Hier in het park", de bingo (binnen/buiten) en de validatie van expeditiestops (`place_id` moet in `zone_id` liggen).

## 4. Bundel (`src/data/types.ts`)
`ParkBundle` krijgt:
```ts
expeditions: BundleExpedition[]   // gelokaliseerd naar de bundeltaal, seizoen nog niet gefilterd (app doet dat)
bingo: BundleBingo | null
routes: BundleRoute[]
```
- `BundleExpedition`: `{ id, title, intro, age, minutes, season, badge: {id, name, icon}, stops: BundleStop[] }`; `BundleStop`: `{ id, title, zone_id, place_id, species, indoor, task: {type, prompt, options, answer, hint} }` (strings al in bundeltaal, `en` valt terug op `nl`).
- `BundleBingo`: `{ sizes, species_share, behaviours: {id, icon, label, indoor_ok}[], species: string[] }` (slugs, al gefilterd op confirmed + foto + niet uitgesloten).
- `BundleRoute`: `{ id, profile, title, intro, note, stops: {place_id, name, indoor}[], svg_points: string, length_m, minutes, concept: true }`.
- `places`: features krijgen de afgeleide `zone_id` (§3.5).
- Badges komen uit expedities plus vaste app-badges (§6.3); badge-iconen zijn emoji of eigen SVG in `src/`.

## 5. Album en opslag (`src/state/album.ts`)
```ts
interface AlbumV1 {
  v: 1
  stickers: Record<string, { first: string; last: string; count: number }>   // slug -> ISO-datum
  days: Record<string, { seen: string[]; favourite?: string }>              // 'YYYY-MM-DD' -> slugs in volgorde
  badges: Record<string, { earned: string }>                               // badge-id
  expeditions: Record<string, { started: string; done: Record<string, string>; completed?: string }>
  bingo: { day: string; size: 9 | 16; seed: number; cells: string[]; marked: number[]; lines: number } | null
}
```
- API (React): `useAlbum()` → `{ album, ready, addSticker(slug), setFavourite(day, slug), markStop(expId, stopId), resetExpedition(expId), setBingo(card), markBingo(i), exportFile(), importFile(file) }`. Eén in-memory kopie + `useSyncExternalStore`; elke wijziging schrijft meteen naar IndexedDB (`set('album', …)`).
- `addSticker` is idempotent per dag (telt `count` één keer per dag op) en voegt toe aan `days[vandaag].seen`.
- **Back-up:** `exportFile()` → `avifauna-album-YYYY-MM-DD.json` (`{app, park, exported, album}`) via `Blob` + download-link; `importFile()` valideert (versie, park-id, vormen) en **voegt samen** (unie; vroegste `first`, laatste `last`, max `count`), nooit blind overschrijven. Ongeldig bestand → melding, niets wijzigen.
- Album-pagina toont een vaste waarschuwing: "Je album staat alleen op dit toestel. Wis je de browsergegevens, dan ben je het kwijt. Maak een back-up."
- Geen IndexedDB (privévenster): album werkt in het geheugen + melding "wordt niet bewaard".

## 6. Functies

### 6.1 Expedities (D) — `src/features/expeditions/`
- `/spelen` lijst (titel, leeftijd, minuten, badge, voortgang "2/5"); `/expeditie/:id` stoppenlijst + actieve stop.
- **Zonecheck** (`zone.ts`, puur, getest): `inZone(fix, zonePolygon)` = punt in polygoon **of** afstand tot de rand ≤ `min(fix.accuracy, 25)` m. GPS (`useGeolocation`, hergebruikt uit `features/map`) staat alleen aan op `/expeditie/:id` zolang er een buitenstop open is, met knop aan/uit.
- Status per stop: `locked` (buiten, niet in zone) → `open` (in zone, of binnen-stop) → `done`. Volgorde vrij; de app stelt de dichtstbijzijnde open stop voor.
- **Terugval zonder GPS** (geweigerd, niet beschikbaar, of 60 s geen fix met accuracy ≤ 50 m): knop "Ik sta er" ontgrendelt de stop (eerlijkheid; kinderen mogen niet vastlopen). Nooit locatie opslaan.
- Alle stops klaar → badge (`album.badges[badge.id]`), feestscherm (respecteert `prefers-reduced-motion`), link naar album.
- Kaart: knop "Toon op de kaart" → `/kaart?plek=<zone_id>`.

### 6.2 Bingo (E) — `src/features/bingo/`
- Kaart per dag: `seed` = hash(datum + teller "nieuwe kaart"), deterministische shuffle (`mulberry32`), `round(size × species_share)` soortvakjes, rest gedrag. Middenvak bij 3×3 en 4×4: geen vrij vak.
- Tik → vakje gemarkeerd (zelf bevestigen). Soortvakje = ook sticker (`addSticker`). Rij/kolom/diagonaal → "Bingo!" (één keer per lijn); volle kaart → badge `bingo-vol`.
- Knop "Nieuwe kaart" (bevestigen; oude kaart vervalt). Keuze 3×3 / 4×4.
- Puur en getest: `makeCard(pool, size, seed)`, `lines(marked, size)`.

### 6.3 Album en badges (F) — `src/features/album/`
- Stickerraster van **alle** soorten in de bundel (ook draft): gevonden = foto in stickerrand + datum; niet gevonden = silhouet/grijs met "?" (geen spoiler van de naam op kind-niveau).
- Teller "12 van 35", badges-rij (verdiend gekleurd, niet verdiend grijs met hoe je hem haalt).
- **Vaste app-badges** (`badges.ts`, in `src/`, parkonafhankelijk: drempels relatief): `eerste-sticker` (1), `tien-stickers` (10), `helft` (50% van confirmed), `alle-confirmed`, `drie-werelddelen` (stickers uit ≥ 3 `facts.continents`), `bingo-vol`, plus elke expeditiebadge.
- "Gezien!"-knop op de soortpagina (alle niveaus, bovenaan bij de naam): zet sticker, toont "In je album ✓". Ook in de bingo.
- Export: **back-up (JSON)**, **afbeelding** (canvas-PNG van het stickervel, op het toestel) en **printen** (`window.print()` met print-CSS, A4; geen pdf-bibliotheek).

### 6.4 Vandaag-gezien-kaartje (G) — `src/features/today/`
- Canvas 1080×1350 (PNG), gemaakt op het toestel: datum, aantal soorten vandaag, tot 6 stickerfoto's (thumbs uit de cache), favoriet (kiesbaar), nieuwe badges van vandaag, parknaam + "onofficiële gids" + app-naam uit `park.json`.
- Delen via `navigator.share({ files })` als dat kan, anders downloaden. De app stuurt zelf niets.
- Fotomakers staan klein onderaan het kaartje (attributie, verplicht bij CC BY/BY-SA): "Foto's: <maker> (CC BY-SA 4.0), …". Past dat niet: foto's weglaten en alleen namen/emoji tonen.

### 6.5 Dagprogramma (L) — `src/features/programme/`
- Puur en getest: `upcoming(programme, now, windowMin = 120)` (dagen, seizoen, tijdzone van het toestel).
- Strook op Start: "Over 12 min: Pinguïns voeren · bij de Grote Vijver" + "Tijden kunnen wijzigen; check avifauna.nl" (link `park.links.programme`) + "laatst gecontroleerd" (`programme.last_checked`). Leeg → niet tonen.
- "Herinner me" per item: alleen zolang de app open is (`setTimeout`, melding in de app 5 min vooraf). Geen pushmeldingen, geen Notification-API.
- Soortpagina "Hier in het park": eerstvolgende item met deze soort.

### 6.6 Routes (M) — `src/features/routes/`
- `/routes`: kaarten per route (profiel-icoon, lengte, minuten, aantal stops, label "concept").
- `/kaart?route=<id>`: polyline-overlay + genummerde stops op de bestaande kaart (`features/map` krijgt een optionele `RouteLayer`; GPS-stip werkt zoals nu).

## 7. Prestaties
- Atlas-LCP zit op 3,0–3,3 s (meetruis, ook op ongewijzigde main). Fase 2 mag de kern niet groter maken: nieuwe code lazy, album-module apart.
- **Experiment (aparte werkkopie):** `preact/compat` in plaats van `react-dom` (~200 kB → ~15 kB ongecomprimeerd). Alleen overnemen als alle tests groen zijn en de atlas-LCP mediaan aantoonbaar < 2,8 s is. Anders: `modulepreload` van de atlas-chunk.

## 8. Statistieken
Wacht op Umami-ID (GATE-1). Nieuwe events alvast vastgelegd voor `track.ts`: `expedition_start {id}`, `expedition_complete {id}`, `bingo_line {size}`, `sticker_add {slug}`, `album_export {kind}` (`json|png|print`), `card_share {method}` (`share|download`), `route_open {id}`. Nooit zone, locatie of antwoorden. In fase 2 als no-op-stubs per feature (`track-stubs.ts`), zoals in fase 1.

## 9. Tests
- Vitest: `album.ts` (sticker idempotent per dag, samenvoegen bij import, ongeldige import), `zone.ts`, bingo (`makeCard` deterministisch, `lines`), `upcoming`, badges, park-build (expedities/bingo/routes in de bundel, zone-afleiding, routegraaf op fixture), validator (confirmed-regel, binnenregel, waypoints).
- Playwright: expeditie met nep-GPS (buiten zone → op slot; in zone → open; binnen-stop zonder GPS), bingo markeren + lijn, Gezien! → album, back-up export/import, vandaag-kaartje maakt een PNG, route op de kaart, programma-strook met nepklok (fixture).
- Lighthouse: kern-pagina's ≥ 90, LCP < 3 s.

## 10. Werkpakketten (subagents op sonnet, parallel per map)
| # | Map(pen) | Inhoud |
|---|---|---|
| W1 | `scripts/park-build/`, `scripts/validate-park.ts`, `parks/schema/` | bundel uitbreiden (§4), zone-afleiding, routegraaf, schema's bingo/routes, validatorregels |
| W2 | `parks/avifauna/expeditions.yaml`, `bingo.yaml`, `routes.yaml` | 3 expedities (o.a. herfst), bingo-gedrag (≥ 16), 3 routes (kinderwagen, regen, kort met peuter) |
| W3 | `src/features/album/`, `src/features/species/` (alleen Gezien!-knop) | album-pagina, badges, export (JSON/PNG/print) |
| W4 | `src/features/expeditions/`, `src/features/play/` | lijst, detail, zonecheck, terugval, hub `/spelen` |
| W5 | `src/features/bingo/` | bingo |
| W6 | `src/features/today/`, `src/features/programme/` | kaartje, programma-strook (+ fixture) |
| W7 | `src/features/routes/`, `src/features/map/` (alleen RouteLayer + `?route=`) | routes |
| W8 | aparte werkkopie | preact-experiment (§7) |
- Hoofdsessie (zwaar model): contracten (types, `album.ts`, `badges`-API), Layout/App/Home-bedrading, e2e, review, gate 2.
- Afspraken: alleen eigen paden stagen (`git add <paden>`, nooit `-A`), niet pushen, commit in het Nederlands met `Co-Authored-By`. Gedeelde bestanden (`App.tsx`, `Layout.tsx`, `Home.tsx`, `styles.css`, `src/i18n/*`, `src/data/types.ts`) alleen door de hoofdsessie; features gebruiken eigen `i18n.ts` en eigen css.
