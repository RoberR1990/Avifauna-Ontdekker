# Bron wereldkaartje

- `continents.ts` is gegenereerd door `build-continents.py` uit **Natural Earth 110m, Admin 0 - Countries** (publiek domein, https://www.naturalearthdata.com/, via https://github.com/nvkelso/natural-earth-vector).
- Per continent samengevoegd (eigenschap `CONTINENT`); Rusland is bij lengtegraad 60 gesplitst (west = Europa, oost = Azië), Frans-Guyana gaat naar Zuid-Amerika. Douglas-Peucker 0,7 graad, eilanden kleiner dan 3 graad² weggelaten, 1 decimaal.
- Projectie equirectangulair, viewBox `0 0 360 180` (x = lengte + 180, y = 90 - breedte).
- Opnieuw genereren: `python src/features/origin/build-continents.py ne_110m_admin_0_countries.geojson > src/features/origin/continents.ts`
