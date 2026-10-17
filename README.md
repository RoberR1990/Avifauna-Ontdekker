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
