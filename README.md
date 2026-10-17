# Avifauna-Ontdekker
## Ontwikkelen

Vereist: Node 24 en pnpm.

```
pnpm install
pnpm exec playwright install chromium   # eenmalig, voor de e2e-tests
pnpm dev            # ontwikkelserver
pnpm build          # tsc + productiebouw (met service worker)
pnpm preview        # bouw lokaal bekijken
pnpm lint           # ESLint
pnpm typecheck      # TypeScript strikt
pnpm test           # Vitest
pnpm test:e2e       # Playwright (bouwt en draait op poort 4173, incl. offline-test)
```

- Hosting op een subpad: `VITE_BASE=/avifauna/ pnpm build`.
- Ander park: `VITE_PARK=<map> pnpm build` (leest `parks/<map>/park.json`; de TypeScript-alias `@park/*` in `tsconfig.app.json` wijst nog naar `parks/avifauna`).
- Pictogrammen opnieuw maken uit `public/icon.svg`: `pnpm exec tsx scripts/make-icons.ts`.

## Parkpakket

Alles wat specifiek is voor een park staat in `parks/<park>/` (nu `parks/avifauna/`). Het datacontract staat in `docs/CONTRACT.md`; de JSON-schema's (draft 2020-12, park-onafhankelijk) in `parks/schema/`; de TypeScript-types in `src/park/types.ts`.

| Bestand | Inhoud | Schema |
|---|---|---|
| `park.json` | naam, talen, links, thema, `map_georef` (pad naar `map/georef.json`) | `park.schema.json` |
| `species.csv` | soorten (slug = wetenschappelijke naam, kleine letters, `-`) | `species-row.schema.json` |
| `places.geojson` | zones, verblijven, voorzieningen, ankerpunten | `places.schema.json` |
| `expeditions.yaml` | expedities, stops, opdrachten, badges | `expeditions.schema.json` |
| `programme.json` | dagprogramma (met datum laatste controle) | `programme.schema.json` |
| `texts/<taal>/<slug>.md` | frontmatter + secties `## kind`, `## b1`, optioneel `## kenner` | `text-frontmatter.schema.json` |
| `media/attributions.json` | één record per mediabestand, licentie-allowlist | `attributions.schema.json` |
| (pipeline-uitvoer) `app-data.<taal>.json` | gouden bestand voor de app | `app-data.schema.json` |

Valideren (schema's, kruisverwijzingen, licentieregels; uitvoer in het Nederlands, exitcode 1 bij fouten):

```
pnpm validate:park                    # parks/avifauna
pnpm validate:park parks/ander-park   # ander park
pnpm validate:park --json             # machineleesbaar
```

Ontbrekende optionele bestanden geven een waarschuwing, geen fout. Testfixtures: `scripts/fixtures/` (`good/` plus `bad/<geval>/`, dat over `good/` heen wordt gelegd).
