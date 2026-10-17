import { expect, test, type Page } from '@playwright/test'

const BAR = 'Onofficieel prototype · gemaakt als voorstel voor Stichting Avifauna'

async function expectBar(page: Page) {
  const bar = page.getByTestId('disclaimer-bar')
  await expect(bar).toBeVisible()
  await expect(bar).toContainText(BAR)
  await expect(bar).toBeInViewport()
}

test('balk is zichtbaar op / en /over', async ({ page }) => {
  await page.goto('/')
  await expectBar(page)
  await page.goto('/over')
  await expectBar(page)
  await expect(page.getByText('Robert Riteco').first()).toBeVisible()
})

test('balk blijft zichtbaar bij scrollen (vast)', async ({ page }) => {
  await page.goto('/over')
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await expectBar(page)
})

test('meta robots noindex aanwezig', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow')
  const res = await page.request.get('/robots.txt')
  expect(await res.text()).toContain('Disallow: /')
})

test('werkt offline na eerste bezoek', async ({ page, context }) => {
  await page.goto('/')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  // wacht tot de service worker de pagina beheert; herlaad zo nodig
  for (let i = 0; i < 5; i++) {
    if (await page.evaluate(() => !!navigator.serviceWorker.controller)) break
    await page.reload()
  }
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  // precache moet gevuld zijn
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).length > 0)).toBe(true)

  await context.setOffline(true)
  await page.reload()
  await expectBar(page)
  await page.getByRole('link', { name: 'Over', exact: true }).click()
  await expect(page).toHaveURL(/\/over$/)
  await expectBar(page)
  await expect(page.getByText('Robert Riteco').first()).toBeVisible()
  // directe navigatie naar /over offline (navigateFallback)
  await page.goto('/over')
  await expectBar(page)
})
