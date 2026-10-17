import { expect, test } from '@playwright/test'
import { expectBar, loadBundle } from './helpers'

test.describe('soortpagina', () => {
  test('drie niveaus wisselen en blijven na reload; attributie onder de foto', async ({ page }) => {
    await page.goto('/soort/spheniscus-humboldti')
    await expectBar(page)
    await expect(page.getByTestId('species-page')).toBeVisible()
    await expect(page.getByTestId('credit-photo')).toContainText('Foto:')
    // attributie staat onder de afbeelding
    const imgBox = await page.locator('.sp-hero img').boundingBox()
    const creditBox = await page.getByTestId('credit-photo').boundingBox()
    expect(creditBox!.y).toBeGreaterThanOrEqual(imgBox!.y + imgBox!.height - 1)

    const levels = page.getByRole('group', { name: 'Leesniveau' })
    await expect(levels.getByRole('button', { name: 'Iedereen' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText('Waar woont hij?')).toBeVisible()

    await levels.getByRole('button', { name: 'Kind' }).click()
    await expect(levels.getByRole('button', { name: 'Kind' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.kidtext')).toBeVisible()
    await expect(page.getByText('Waar woont hij?')).toHaveCount(0)
    await page.reload()
    await expect(levels.getByRole('button', { name: 'Kind' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.kidtext')).toBeVisible()

    await levels.getByRole('button', { name: 'Kenner' }).click()
    await expect(levels.getByRole('button', { name: 'Kenner' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('html')).toHaveAttribute('data-level', 'kenner')
    const facts = page.locator('dl.facts').first()
    await expect(facts).toBeVisible()
    await expect(facts).toContainText('Orde')
    await expect(facts).toContainText('Familie')
    await expect(facts).toContainText('Lengte')
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-level', 'kenner')
    await expect(levels.getByRole('button', { name: 'Kenner' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('audio-element alleen bij soorten met audio', async ({ page }) => {
    await page.goto('/')
    const { species } = await loadBundle(page)
    const withAudio = species.find((s) => s.slug === 'bubo-bubo' && s.audio) ?? species.find((s) => s.audio)
    const without = species.find((s) => !s.audio)
    expect(withAudio, 'bundel bevat een soort met audio').toBeTruthy()
    expect(without, 'bundel bevat een soort zonder audio').toBeTruthy()

    await page.goto(`/soort/${withAudio!.slug}`)
    await expect(page.getByRole('heading', { level: 2, name: 'Hoor hem' })).toBeVisible()
    await expect(page.locator('audio')).toHaveCount(1)
    await expect(page.getByTestId('credit-audio')).toBeVisible()

    await page.goto(`/soort/${without!.slug}`)
    await expect(page.getByTestId('species-page')).toBeVisible()
    await expect(page.locator('audio')).toHaveCount(0)
    await expect(page.getByRole('heading', { level: 2, name: 'Hoor hem' })).toHaveCount(0)
  })

  test('onbekende soort geeft een melding met terugknop', async ({ page }) => {
    await page.goto('/soort/bestaat-niet')
    await expectBar(page)
    await expect(page.locator('a.btn[href="/atlas"]')).toBeVisible()
  })
})
