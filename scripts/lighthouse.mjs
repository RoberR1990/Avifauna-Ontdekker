// Lighthouse (mobiel, standaard gesimuleerde 4G/slow-4G) op een productiebuild.
// Gebruik: pnpm lighthouse  (bouwt, start vite preview, meet, schrijft naar lighthouse-reports/)
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import lighthouse from 'lighthouse'
import { Launcher, launch } from 'chrome-launcher'
import { chromium } from '@playwright/test'

const PORT = 4174
const BASE = `http://localhost:${PORT}`
const PAGES = ['/', '/atlas', '/soort/spheniscus-humboldti']
const MIN_PERFORMANCE = 90
const MAX_LCP_MS = 3000
const OUT = 'lighthouse-reports'

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const run = (args) => spawnSync(pnpm, args, { stdio: 'inherit', shell: process.platform === 'win32' })

if (!process.env.LH_SKIP_BUILD) {
  if (run(['build']).status !== 0) process.exit(1)
}

const server = spawn(pnpm, ['exec', 'vite', 'preview', '--port', String(PORT), '--strictPort'], {
  stdio: 'ignore',
  shell: process.platform === 'win32',
})
const stopServer = () => {
  if (process.platform === 'win32' && server.pid) spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'])
  else server.kill()
}

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(BASE)).ok) return
    } catch {
      /* nog niet klaar */
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('vite preview start niet')
}

let chrome
const rows = []
let failed = false
try {
  await waitForServer()
  mkdirSync(OUT, { recursive: true })
  // Geinstalleerde Chrome (chrome-launcher zoekt zelf); anders Playwright-chromium of CHROME_PATH.
  const fallback = existsSync(chromium.executablePath()) ? chromium.executablePath() : undefined
  chrome = await launch({
    chromePath: process.env.CHROME_PATH || (Launcher.getFirstInstallation() ? undefined : fallback),
    chromeFlags: ['--headless=new', '--no-sandbox'],
  })
  for (const path of PAGES) {
    const res = await lighthouse(BASE + path, { port: chrome.port, output: ['json', 'html'], logLevel: 'error' }, undefined)
    const lhr = res.lhr
    const name = path === '/' ? 'home' : path.slice(1).replace(/\//g, '-')
    writeFileSync(`${OUT}/${name}.json`, res.report[0])
    writeFileSync(`${OUT}/${name}.html`, res.report[1])
    const score = (id) => Math.round((lhr.categories[id].score ?? 0) * 100)
    const a = lhr.audits
    const row = {
      pagina: path,
      perf: score('performance'),
      a11y: score('accessibility'),
      bp: score('best-practices'),
      seo: score('seo'),
      lcp: Math.round(a['largest-contentful-paint'].numericValue),
      tbt: Math.round(a['total-blocking-time'].numericValue),
      cls: Number(a['cumulative-layout-shift'].numericValue.toFixed(3)),
    }
    rows.push(row)
    if (row.perf < MIN_PERFORMANCE || row.lcp > MAX_LCP_MS) failed = true
  }
} finally {
  await chrome?.kill()
  stopServer()
}

console.log('\nLighthouse (mobiel, gesimuleerde 4G) - SEO is laag door noindex: bedoeld')
console.table(rows)
writeFileSync(`${OUT}/samenvatting.json`, JSON.stringify(rows, null, 2))
if (failed) {
  console.error(`FAIL: performance < ${MIN_PERFORMANCE} of LCP > ${MAX_LCP_MS} ms`)
  process.exit(1)
}
console.log('OK')
