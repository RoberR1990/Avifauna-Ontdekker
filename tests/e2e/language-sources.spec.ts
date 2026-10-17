import { expect, test } from '@playwright/test'
import { BAR_EN, expectBar } from './helpers'

test('taal EN: UI, soortnaam en tekst in het Engels', async ({ page }) => {
  await page.goto('/soort/spheniscus-humboldti')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Humboldtpinguïn')
  await page.getByRole('button', { name: /^Menu/ }).click()
  await page.locator('.lang-switch').getByRole('button', { name: 'EN' }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expectBar(page, BAR_EN)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Humboldt Penguin/i)
  await expect(page.getByRole('group', { name: 'Reading level' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Everyone' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('(alleen in het Nederlands)')).toHaveCount(0)
  await expect(page.locator('.readable').first()).toContainText(/\b(the|and|penguin)\b/i)
  await expect(page.getByTestId('credit-photo')).toContainText('Photo:')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await page.goto('/atlas')
  await expect(page.getByRole('heading', { level: 1, name: 'Bird atlas' })).toBeVisible()
})

test('bronnenpagina toont attributies', async ({ page }) => {
  await page.goto('/bronnen')
  await expectBar(page)
  await expect(page.getByRole('heading', { level: 1, name: 'Bronnen en licenties' })).toBeVisible()
  const items = page.locator('.src-list > li')
  expect(await items.count()).toBeGreaterThan(20)
  const first = items.first()
  await expect(first).toContainText('Maker')
  await expect(first).toContainText('Licentie')
  await expect(first.locator('a[href^="http"]').first()).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: /Humboldt/ })).toBeVisible()
})

test('disclaimerbalk op alle pagina s', async ({ page }) => {
  for (const path of ['/', '/atlas', '/soort/spheniscus-humboldti', '/kaart', '/peuter', '/bronnen', '/over']) {
    await page.goto(path)
    await expectBar(page)
  }
})
