import { expect, test } from '@playwright/test'
import { waitForSw } from './helpers'

test('installeerbaar: geldig manifest, icons en geregistreerde service worker', async ({ page }) => {
  await page.goto('/')
  await waitForSw(page)

  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(href).toBeTruthy()
  const manifestUrl = new URL(href!, page.url()).href
  const res = await page.request.get(manifestUrl)
  expect(res.ok()).toBe(true)
  const m = await res.json()
  expect(m.name).toBeTruthy()
  expect(m.short_name).toBeTruthy()
  expect(m.start_url).toBeTruthy()
  expect(m.display).toMatch(/standalone|fullscreen|minimal-ui/)
  expect(m.theme_color).toMatch(/^#/)
  expect(m.background_color).toMatch(/^#/)

  const icons = m.icons as { src: string; sizes: string; type: string; purpose?: string }[]
  const sizes = icons.map((i) => i.sizes)
  expect(sizes).toContain('192x192')
  expect(sizes).toContain('512x512')
  expect(icons.some((i) => i.purpose?.includes('maskable'))).toBe(true)
  for (const icon of icons) {
    const r = await page.request.get(new URL(icon.src, manifestUrl).href)
    expect(r.ok(), icon.src).toBe(true)
    expect(r.headers()['content-type']).toContain(icon.type)
  }

  const sw = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration()
    return { scope: reg?.scope, active: reg?.active?.state }
  })
  expect(sw.active).toBe('activated')
  expect(new URL(sw.scope!).pathname).toBe(new URL(m.scope ?? '/', manifestUrl).pathname)
})
