import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { expectBar } from './helpers'

// Fase 2: expedities (zone-GPS, binnen-stop), bingo, album + back-up, vandaag-kaartje, routes.

type Feature = { properties: { id: string; kind: string }; geometry: { type: string; coordinates: number[][][] } }
const places = JSON.parse(readFileSync('parks/avifauna/places.geojson', 'utf8')) as { features: Feature[] }

/** Zwaartepunt van de buitenring (ruw, genoeg voor een punt midden in een concept-zone). */
function zoneCenter(id: string): { latitude: number; longitude: number } {
  const f = places.features.find((p) => p.properties.id === id)!
  const ring = f.geometry.coordinates[0]
  const lon = ring.reduce((s, c) => s + c[0], 0) / ring.length
  const lat = ring.reduce((s, c) => s + c[1], 0) / ring.length
  return { latitude: lat, longitude: lon }
}

interface Stop { id: string; title: string; zone_id: string; indoor: boolean; task: { type: string; options: string[] | null; answer: number | null } }
interface Exp { id: string; stops: Stop[] }

async function expeditions(page: Page): Promise<Exp[]> {
  return page.evaluate(async () => (await (await fetch('/park/data.nl.json')).json()).expeditions)
}

test.describe('spelen', () => {
  test('hub toont expedities, bingo, routes en album', async ({ page }) => {
    await page.goto('/spelen')
    await expectBar(page)
    await expect(page.getByRole('heading', { level: 1, name: 'Spelen' })).toBeVisible()
    await expect(page.getByRole('link', { name: /Vogels uit Afrika/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /Vogelbingo/ })).toBeVisible()
  })

  test('expeditie: binnen-stop zonder GPS, keuze wordt gecontroleerd', async ({ page }) => {
    await page.goto('/spelen')
    const exp = (await expeditions(page)).find((e) => e.stops.some((s) => s.indoor))!
    const stop = exp.stops.find((s) => s.indoor)!
    await page.goto(`/expeditie/${exp.id}`)
    await page.getByRole('button', { name: new RegExp(stop.title) }).click()
    const active = page.getByTestId('ex-active')
    await expect(active).not.toContainText('Zoek mijn plek')
    const wrong = stop.task.options!.findIndex((_, i) => i !== stop.task.answer)
    await active.getByRole('button', { name: stop.task.options![wrong], exact: true }).click()
    await expect(active.locator('.ex-feedback[data-kind="wrong"]')).toBeVisible()
    await active.getByRole('button', { name: stop.task.options![stop.task.answer!], exact: true }).click()
    await expect(page.getByTestId('ex-progress')).toContainText('1 van')
  })

  test('expeditie: buitenstop opent alleen met GPS in de zone', async ({ page, context }) => {
    await page.goto('/spelen')
    const exp = (await expeditions(page)).find((e) => e.id === 'vogels-uit-afrika')!
    const stop = exp.stops[0]
    await context.grantPermissions(['geolocation'])
    // Buiten het park: blijft op slot.
    await context.setGeolocation({ latitude: 52.3676, longitude: 4.9041, accuracy: 10 })
    await page.goto(`/expeditie/${exp.id}`)
    await page.getByRole('button', { name: new RegExp(stop.title) }).first().click()
    await page.getByRole('button', { name: 'Zoek mijn plek' }).click()
    const active = page.getByTestId('ex-active')
    await expect(active).toContainText('Loop naar deze plek')
    // In de zone: open.
    await context.setGeolocation({ ...zoneCenter(stop.zone_id), accuracy: 10 })
    await expect(active).not.toContainText('Loop naar deze plek', { timeout: 10_000 })
    // Locatie wordt nergens bewaard.
    const stored = await page.evaluate(() => JSON.stringify(localStorage))
    expect(stored).not.toMatch(/52\.13|4\.64/)
  })

  test('bingo: soortvakje markeren zet een sticker in het album', async ({ page }) => {
    await page.goto('/bingo')
    await expectBar(page)
    const cell = page.locator('button[aria-pressed]').filter({ has: page.locator('img') }).first()
    await expect(cell).toBeVisible()
    await cell.click()
    await expect(cell).toHaveAttribute('aria-pressed', 'true')
    await page.goto('/album')
    await expect(page.getByTestId('sticker-found')).toHaveCount(1)
  })

  test('Gezien! → album → back-up maken en terugzetten → vandaag-kaartje', async ({ page }) => {
    await page.goto('/soort/struthio-camelus')
    await page.getByRole('button', { name: 'Gezien!' }).click()
    await expect(page.getByRole('button', { name: 'In je album ✓' })).toBeVisible()

    await page.goto('/album')
    await expect(page.getByTestId('album-count')).toContainText('1 van')
    await expect(page.getByText('Je album staat alleen op dit toestel')).toBeVisible()
    const dl = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Back-up maken' }).click()
    const file = await dl
    expect(file.suggestedFilename()).toMatch(/^album-avifauna-\d{4}-\d{2}-\d{2}\.json$/)
    const path = await file.path()

    // Album leegmaken (nieuwe context zou ook kunnen) en terugzetten.
    await page.evaluate(() => new Promise((r) => { const q = indexedDB.deleteDatabase('ao-album'); q.onsuccess = q.onerror = q.onblocked = r }))
    await page.reload()
    await page.getByTestId('album-file').setInputFiles(path)
    await expect(page.getByTestId('album-message')).toContainText('Back-up teruggezet')
    await expect(page.getByTestId('sticker-found')).toHaveCount(1)

    await page.goto('/vandaag')
    await expect(page.getByText('Struisvogel').first()).toBeVisible()
    const png = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Opslaan' }).click()
    expect((await png).suggestedFilename()).toMatch(/\.png$/)
  })

  test('routes: lijst en route op de kaart', async ({ page }) => {
    await page.goto('/routes')
    const card = page.getByTestId('route-card').first()
    await expect(card).toContainText('Concept')
    await card.getByRole('link', { name: 'Toon op de kaart' }).click()
    await expect(page).toHaveURL(/\/kaart\?route=/)
    await expect(page.getByTestId('route-line')).toBeAttached()
    expect(await page.getByTestId('route-stop').count()).toBeGreaterThan(2)
  })

  test('onderbalk heeft Spelen en Album; kopmenu heeft taal en peuterstand', async ({ page }) => {
    await page.goto('/')
    const nav = page.getByRole('navigation', { name: 'Hoofdmenu' })
    await expect(nav.getByRole('link', { name: 'Spelen' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Album' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Peuterstand' })).toBeHidden()
    await page.getByRole('button', { name: /^Menu/ }).click()
    await expect(page.getByRole('link', { name: 'Peuterstand' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('link', { name: 'Peuterstand' })).toBeHidden()
  })
})
