import { expect, test } from '@playwright/test'
import { expectBar, waitForSw } from './helpers'

test.describe('offline', () => {
  test('atlas, soortpagina met thumb, kaart en peuterstand werken offline', async ({ page, context }) => {
    await page.goto('/')
    await waitForSw(page)
    await context.setOffline(true)

    await page.goto('/atlas')
    await expectBar(page)
    const cards = page.locator('a.atlas-card')
    await expect(cards.first()).toBeVisible()
    expect(await cards.count()).toBeGreaterThan(5)
    await expect
      .poll(() =>
        page.evaluate(() => {
          const img = document.querySelector<HTMLImageElement>('a.atlas-card img')
          return !!img && img.complete && img.naturalWidth > 0
        }),
      )
      .toBe(true)

    await cards.filter({ hasText: 'Humboldt' }).click()
    await expect(page).toHaveURL(/\/soort\/spheniscus-humboldti$/)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Humboldt')
    await expect(page.getByTestId('credit-photo')).toBeVisible()

    await page.goto('/kaart')
    await expect(page.getByTestId('park-map')).toBeVisible()
    await expect.poll(() => page.evaluate(() => document.querySelectorAll('[data-place]').length)).toBeGreaterThan(5)

    await page.goto('/peuter')
    await expect(page.locator('.td-tile').first()).toBeVisible()
    await page.locator('.td-tile').first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
  })

  async function downloadAll(page: import('@playwright/test').Page, slug: string) {
    // Databesparing aan: dan start de achtergronddownload niet en blijft alleen de knop over.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'connection', { value: { saveData: true, effectiveType: '4g' }, configurable: true })
    })
    await page.goto('/')
    await waitForSw(page)
    const big = `park/media/photos/${slug}.webp`
    const inCache = () =>
      page.evaluate(async (u) => {
        if (!(await caches.has('park-media'))) return false
        const c = await caches.open('park-media')
        return (await c.keys()).some((r) => r.url.endsWith(u))
      }, big)
    expect(await inCache()).toBe(false)
    await page.getByRole('button', { name: 'Download alles voor offline' }).click()
    await expect(page.getByTestId('offline-complete')).toBeVisible({ timeout: 90_000 })
    expect(await inCache()).toBe(true)
    const count = await page.evaluate(async () => (await (await caches.open('park-media')).keys()).length)
    expect(count).toBeGreaterThan(20)
  }

  test('Download alles voor offline zet grote foto en audio in cache park-media', async ({ page }) => {
    test.setTimeout(120_000)
    await downloadAll(page, 'spheniscus-humboldti')
    const audio = await page.evaluate(async () =>
      (await (await caches.open('park-media')).keys()).some((r) => r.url.includes('/audio/')),
    )
    expect(audio).toBe(true)
  })

  test('soortpagina toont offline de grote foto na de download', async ({ page, context }) => {
    test.setTimeout(120_000)
    // BUG (vite.config.ts regel 49): urlPattern gebruikt `base`, maar de functie wordt in de service worker
    // gestringified en `base` bestaat daar niet (ReferenceError) -> runtime-route park-media matcht nooit,
    // de cache wordt dus niet uit de service worker bediend. Deze test slaagt zodra dat is opgelost.
    const slug = 'spheniscus-humboldti'
    await downloadAll(page, slug)
    await context.setOffline(true)
    await page.goto(`/soort/${slug}`)
    const img = page.locator('.sp-hero img')
    await expect(img).toBeVisible()
    await expect
      .poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0), { timeout: 8000 })
      .toBe(true)
  })
})
