import { expect, test } from '@playwright/test'
import { expectBar } from './helpers'

test.describe('atlas', () => {
  test('zoeken zonder trema vindt Humboldtpinguïn', async ({ page }) => {
    await page.goto('/atlas')
    await expectBar(page)
    const cards = page.locator('a.atlas-card')
    await expect(cards.first()).toBeVisible()
    expect(await cards.count()).toBeGreaterThan(5)
    await page.getByRole('searchbox').fill('pinguin')
    await expect(cards).toHaveCount(1)
    await expect(cards.first()).toContainText('Humboldt')
    await expect(page.locator('.atlas-count')).toHaveText('1 soort')
  })

  test('filter kleur rood wijzigt teller en URL; wis filters', async ({ page }) => {
    await page.goto('/atlas')
    const cards = page.locator('a.atlas-card')
    await expect(cards.first()).toBeVisible()
    const total = await cards.count()
    await page.getByRole('button', { name: /^Filters/ }).click()
    await page.locator('fieldset', { hasText: 'Kleur' }).getByRole('button', { name: 'Rood' }).click()
    await expect.poll(() => new URL(page.url()).search).toContain('red')
    const n = await cards.count()
    expect(n).toBeGreaterThan(0)
    expect(n).toBeLessThan(total)
    await expect(page.locator('.atlas-count')).toHaveText(n === 1 ? '1 soort' : `${n} soorten`)
    await page.getByRole('button', { name: 'Wis filters' }).click()
    await expect(cards).toHaveCount(total)
    expect(new URL(page.url()).search).toBe('')
  })

  test('filter in de URL blijft na reload', async ({ page }) => {
    await page.goto('/atlas')
    await page.getByRole('button', { name: /^Filters/ }).click()
    await page.locator('fieldset', { hasText: 'Kleur' }).getByRole('button', { name: 'Rood' }).click()
    await expect.poll(() => new URL(page.url()).search).toContain('red')
    const n = await page.locator('a.atlas-card').count()
    await page.reload()
    await expect(page.locator('a.atlas-card')).toHaveCount(n)
  })

  test('klik op kaart opent soortpagina', async ({ page }) => {
    await page.goto('/atlas')
    await page.locator('a.atlas-card', { hasText: 'Humboldt' }).click()
    await expect(page).toHaveURL(/\/soort\/spheniscus-humboldti$/)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Humboldt')
  })
})
