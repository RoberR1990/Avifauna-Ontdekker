# veldwerk: foto's van naambordjes -> concept-soortenlijst

Verwerkt de veldwerkfoto's (zie `VELDWERK.md`) tot een controlelijst, een concept-`species.csv` en concept-`places.geojson`. De foto's blijven in `veldwerk/` (staat in `.gitignore`); er wordt niets van gepubliceerd.

## Gebruik

1. Zet de originele foto's (JPG, HEIC, PNG) in `D:\Avifauna\veldwerk\`, eventueel met `notities.txt`.
   Een regel `IMG_1234.jpg: gesloten wegens onderhoud` koppelt een notitie aan die foto.
2. Draai vanuit `pipeline/`:
   ```
   ..\.venv\Scripts\python -m veldwerk
   ```
   De eerste keer wordt de soortenlijst uit Wikidata opgehaald (1-2 minuten, daarna gecachet in `pipeline/data/cache/bird-names.json`). Verwerken van 250 foto's duurt enkele minuten; de OCR-uitkomst wordt per foto onthouden, een tweede run is snel.
3. Open `veldwerk/uitvoer/controlelijst.html`. Bovenaan staat een samenvatting; rijen met een gele rand vragen aandacht (geen GPS, lage OCR-zekerheid, geen match, enz.). Elke rij heeft een OpenStreetMap-link naar de plek.
4. Open `veldwerk/uitvoer/controlelijst.csv` (puntkomma-gescheiden, opent direct in Nederlandse Excel) en vul de kolom `correctie` in:

   | waarde | betekenis |
   |---|---|
   | `ok` | match klopt, status wordt `confirmed` |
   | `Genus species` | andere soort (wetenschappelijke naam), status `confirmed` |
   | `weg` | rij negeren |
   | `verblijf Naam` | (foto zonder bordje) dit is een verblijf |
   | `facility:toilet Naam` | (foto zonder bordje) voorziening; types: `toilet baby_change food water playground picnic show feeding entrance exit first_aid info shelter` |
   | leeg | niets besloten: een rij met match komt als `draft` mee, een rij zonder match vervalt |

   In de kolom `plaatsnaam` geef je het verblijf een naam (geldt voor de hele plek). Sla op als CSV (puntkomma of komma mag).
5. Voeg samen in het parkpakket:
   ```
   ..\.venv\Scripts\python -m veldwerk apply
   ```
   Dit schrijft `parks/avifauna/species.csv` en `places.geojson`. Bestaande `confirmed`/`absent`-rijen worden niet overschreven (alleen lege velden aangevuld); bestaande plekken binnen 12 m worden hergebruikt; nieuwe plekken krijgen het volgende vrije `verblijf-NNN`. Bevat `places.geojson` zones (`kind=zone`), dan wordt `zone_id` bepaald met point-in-polygon.

## Uitvoer in `veldwerk/uitvoer/`

- `controlelijst.html` en `controlelijst.csv`: de rijen om te controleren (één per foto/bord; meerdere soorten op één bord = meerdere rijen).
- `concept-species.csv` en `concept-places.geojson`: het ongecontroleerde concept volgens `docs/CONTRACT.md` (status `draft`, `source=veldwerk`).
- `ocr-cache.json`: onthouden OCR-uitkomsten.

## Hoe het werkt

- EXIF: GPS (+ nauwkeurigheid/hoogte), opnametijd, oriëntatie. Foto's zonder GPS blijven staan en krijgen de vlag `geen GPS`.
- Binnenfoto's zonder GPS tussen twee GPS-foto's (binnen 15 min) krijgen een in de tijd geschatte positie en de vlag `binnen, positie geschat`.
- OCR: tesseract `nld+eng` na oriëntatie, grijswaarden, autocontrast en schalen; bij lage zekerheid ook OSD-rotatie, rotaties en omgekeerde kleuren.
- Matching: binomialen met fuzzy matching (corrigeert o.a. `1`->`l`) en Nederlandse/Engelse namen tegen de Wikidata-referentielijst. Beste match, score en 2 alternatieven.
- Plekken: opeenvolgende foto's binnen 12 m (en niet langer dan 30 min uit elkaar) vormen een plek `verblijf-NNN`.

## Overige commando's

```
python -m veldwerk run --input MAP --output MAP --no-ocr --workers 4 --refresh-names
python -m veldwerk names      # soortenlijst vernieuwen
python -m veldwerk tessdata   # Nederlandse OCR-taaldata downloaden naar tools/tessdata
pytest veldwerk               # tests (OCR-test wordt overgeslagen zonder tesseract)
```

Vereist: Tesseract (`C:\Program Files\Tesseract-OCR\tesseract.exe`), en in de venv `pillow-heif` voor iPhone-foto's (HEIC). Testfoto's staan in `tests/fixtures/` (synthetisch, `python -m veldwerk.tests.make_fixtures`).
