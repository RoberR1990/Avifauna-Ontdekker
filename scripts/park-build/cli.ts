// pnpm build:park — schrijft het parkpakket naar dist-park/ ter inspectie.
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Lang } from '../../src/data/types.ts'
import { buildBundle } from './index.ts'

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..')
const parkDir = join(root, 'parks', process.env.VITE_PARK || 'avifauna')
const out = join(root, 'dist-park')

rmSync(out, { recursive: true, force: true })
const langs: Lang[] = ['nl', 'en']
for (const lang of langs) {
  const { bundle, files, warnings } = buildBundle(parkDir, lang)
  for (const w of warnings) console.warn(`waarschuwing: ${w}`)
  mkdirSync(join(out, 'park'), { recursive: true })
  writeFileSync(join(out, 'park', `data.${lang}.json`), JSON.stringify(bundle, null, 2))
  for (const f of files) {
    const to = join(out, f.to)
    mkdirSync(dirname(to), { recursive: true })
    copyFileSync(f.from, to)
  }
  const mb = bundle.media_manifest.reduce((s, m) => s + m.bytes, 0) / 1e6
  console.log(`${lang}: ${bundle.species.length} soorten, ${bundle.attributions.length} attributies, media ${mb.toFixed(1)} MB`)
}
console.log(`geschreven naar ${out}`)
