import { expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

export const BAR = 'Onofficieel prototype · gemaakt als voorstel voor Stichting Avifauna'
export const BAR_EN = 'Unofficial prototype · made as a proposal for Stichting Avifauna'

export const park = JSON.parse(readFileSync('parks/avifauna/park.json', 'utf8')) as {
  center: { lat: number; lon: number }
}

export async function expectBar(page: Page, text = BAR) {
  const bar = page.getByTestId('disclaimer-bar')
  await expect(bar).toBeVisible()
  await expect(bar).toContainText(text)
  await expect(bar).toBeInViewport()
}

/** Wacht tot de service worker de pagina beheert en de precache gevuld is. */
export async function waitForSw(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  for (let i = 0; i < 5; i++) {
    if (await page.evaluate(() => !!navigator.serviceWorker.controller)) break
    await page.reload()
  }
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).length > 0)).toBe(true)
}

/** Soorten uit de gebundelde data (draait in de browser). */
export async function loadBundle(page: Page) {
  return page.evaluate(async () => {
    const d = await (await fetch('/park/data.nl.json')).json()
    return d as { species: { slug: string; name: string; audio: unknown }[] }
  })
}
