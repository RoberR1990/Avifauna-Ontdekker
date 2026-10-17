import { expect, test } from '@playwright/test'
import { expectBar } from './helpers'

test.describe('peuterstand', () => {
  test('raster, tik opent detail met naam, terug', async ({ page }) => {
    await page.goto('/peuter')
    await expectBar(page)
    const tiles = page.locator('.td-tile')
    await expect(tiles.first()).toBeVisible()
    expect(await tiles.count()).toBeGreaterThan(5)
    const name = await tiles.first().getAttribute('aria-label')
    await tiles.first().click()
    const dialog = page.getByRole('dialog', { name: name! })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText(name!)
    await expect(dialog.locator('img').first()).toBeVisible()
    await dialog.getByRole('button', { name: 'Terug naar alle dieren' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(tiles.first()).toBeVisible()
  })

  test('volgende dier wisselt het detail', async ({ page }) => {
    await page.goto('/peuter')
    await page.locator('.td-tile').first().click()
    const dialog = page.getByRole('dialog')
    const first = await dialog.getAttribute('aria-label')
    await dialog.getByRole('button', { name: 'Volgende dier' }).click()
    await expect(dialog).not.toHaveAttribute('aria-label', first!)
  })

  test('Klaar werkt alleen na 1 s ingedrukt houden', async ({ page }) => {
    await page.goto('/peuter')
    const done = page.getByRole('button', { name: /^Klaar/ })
    await done.click({ force: true })
    await expect(page).toHaveURL(/\/peuter$/)
    const box = (await done.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.waitForTimeout(1300)
    await page.mouse.up()
    await expect(page).toHaveURL(/\/$/)
  })
})
