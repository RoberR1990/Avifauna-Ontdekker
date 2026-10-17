# Wat OpenStreetMap bevat over Avifauna

Bron: OSM-way [31775874](https://www.openstreetmap.org/way/31775874) (`tourism=zoo`, `name=Avifauna`, wikidata Q840700). Uitsnede: parkgrens + 30 m buffer. Opgehaald 2026-10-17 (OSM-basis 08:55 UTC). Gegevens © OpenStreetMap-bijdragers, ODbL.

## Aantallen per kaartlaag (map-base.svg)
| Laag | Aantal | Opmerking |
|---|---|---|
| paden (`highway`) | 139 | 81 footway, 43 service, 5 cycleway, rest path/steps/track/straten; ook wegen buiten het park binnen de buffer |
| groen | 140 | 66 scrub, 34 gras, 30 bos, 7 tuin, 1 speeltuin, 2 grasland |
| gebouwen | 71 | 53 `building=yes` zonder type; slechts 8 met naam |
| hekwerk | 86 | 67 hek, 15 haag, 3 muur, 1 keermuur |
| water | 24 | 18 `natural=water`, 2 zwembaden (buiten het park), sloten/beek |
| bomen | 238 | losse `natural=tree` (alleen als stippen getekend) |
| POI's | 80 | 20 banken, 18 dierattracties, 14 hekken/poorten, 14 `entrance`, 5 parkeerplekken, 2 toiletten, 1 restaurant, 1 AED, 1 fontein, 1 picknicktafel, 2 laadpalen, 2 fietsparkeerplekken, ... |
| grens | 1 | way 31775874 |

## Benoemde objecten
- **Gebouwen (8 met naam):** Tropenhal, Receptie, Parkrestaurant, Lori landing, Speelhal, Manege, Avifauna kantoor; Zwembad De Hoorn (buiten het park).
- **Restaurant (punt):** Lepelaar.
- **Ingang:** `Avifauna` (entrance, node 45429396), `Hoofdingang / CADO 1`, poorten CADO 2, 3, 5, 6, 7 (CADO 2/3 afgesloten).
- **Verblijven/attracties (`tourism=attraction` + `attraction=animal`, 18 stuks, allemaal met naam):** Cuba volière; Emoe, saruskraanvogel, zwarte zwaan, ekstergans; Gierenvallei - Umvikeli; Grote Vijver - Kroeskoppelikaan; Helmkasuaris (2x); Humboldtpinguïn; Kaneeltaling, zilvertaling; Mara; Noord-Afrikaanse struisvogel, kroonkraanvogel, helmparelhoen; Reuzenmiereneter, zwartmaskeribis, witwangfluiteend; Ringstaartmaki, rode vari, roodbuikmaki, zwarte kroonkraanvogel, zwarte ooievaar, kuifparelhoender, gierparelhoender; Rode brulaap, witgezichtsaki, rode titi, keizertamarin; Rode panda, Mantsjoerijse kraanvogel; Stellers zeearend, zwarte wouw, raaf; Stokstaartje; Vicuña, reuzenmiereneter, Darwins nandoe, kuihoenderkoet, zwarthalszwaan, peposaka-eend; Vogeldemonstratie.
- Namen van verblijven zijn soortenlijsten (komma-gescheiden) en dus geschikt als input voor het koppelen van soort aan `place_id` (veldwerk blijft leidend).

## Hiaten (zelf toe te voegen in OSM)
- **Verblijven:** slechts 18 punten voor een park met honderden soorten; geen verblijf is een vlak (polygoon) of heeft `zoo=*`/soortentag; alleen punten, dus geen echte omtrek. Veel soorten (pinguins-in-hal, flamingo's, lori's, uilen, ...) ontbreken of staan in een samengestelde naam.
- **Toiletten:** 2 punten zonder naam of `indoor`/`wheelchair`-detail (een heeft `wheelchair=no`); babyverschoning (`changing_table=yes`) ontbreekt geheel. Het restaurant heeft `toilets:wheelchair=yes`.
- **Gebouwen:** 63 van 71 zonder naam of type; Tropenhal heeft geen `building`-subtype/`tourism`-tag, ingangen van de hal zijn niet als `entrance` getagd met `indoor`.
- **Horeca/voorzieningen:** alleen Lepelaar en Parkrestaurant; geen kiosken, ijskraam, souvenirwinkel (`shop=*`), geen drinkwater, geen EHBO-post, geen `information`-borden, geen `tourism=picnic_site`.
- **Speelplekken:** 1 speeltuin (`access=customers`, geen naam), 1 picknicktafel.
- **Show/voederen:** alleen punt Vogeldemonstratie en een tribune (`leisure=bleachers`); voedertijden/lori-landing hebben geen tags.
- **Paden:** `surface`, `wheelchair` en `incline` ontbreken grotendeels; handig voor een rolstoelroute.
- **Zones:** geen zone-polygonen (Tropenhal, Gierenvallei, Grote Vijver, ...); die moeten we zelf tekenen (`places.geojson`, kind=zone).
- Buiten het park maar binnen de grens: hotel Van der Valk, zwembad, kantoren, parkeerterreinen; niet relevant voor de bezoekerskaart.

## Regenereren
`cd pipeline && ..\.venv\Scripts\python -m osm fetch` (Overpass) en `python -m osm svg`.
