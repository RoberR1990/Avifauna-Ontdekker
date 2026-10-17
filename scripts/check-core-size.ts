// Telt de grootte van de Workbox-precache in dist/ en faalt boven 5 MB (FASE-1 §2).
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const LIMIT = 5 * 1024 * 1024
const dist = resolve(fileURLToPath(new URL('.', import.meta.url)), '../dist')
const swPath = join(dist, 'sw.js')
if (!existsSync(swPath)) {
  console.error('dist/sw.js ontbreekt; draai eerst pnpm build')
  process.exit(2)
}

const sw = readFileSync(swPath, 'utf8')
const start = sw.indexOf('precacheAndRoute([')
const end = start < 0 ? -1 : sw.indexOf('],{', start)
const manifestSrc = start < 0 ? '' : sw.slice(start, end)
const urls = [...manifestSrc.matchAll(/["']?url["']?:\s*["']([^"']+)["']/g)].map((m) => m[1])
const unique = [...new Set(urls)]
const sizes = unique.map((u) => {
  const f = join(dist, decodeURIComponent(u.split('?')[0]))
  return { url: u, bytes: existsSync(f) ? statSync(f).size : 0 }
})
const total = sizes.reduce((s, x) => s + x.bytes, 0)
sizes.sort((a, b) => b.bytes - a.bytes)
console.log(`Precache: ${unique.length} bestanden, ${(total / 1024 / 1024).toFixed(2)} MB (limiet 5 MB)`)
for (const s of sizes.slice(0, 5)) console.log(`  ${(s.bytes / 1024).toFixed(0).padStart(6)} kB  ${s.url}`)
if (unique.length === 0) {
  console.error('Geen precache-manifest gevonden in sw.js')
  process.exit(2)
}
if (total > LIMIT) {
  console.error('Kern te groot')
  process.exit(1)
}
