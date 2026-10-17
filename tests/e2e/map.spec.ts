import { expect, test } from '@playwright/test'
import { expectBar, park } from './helpers'

test.describe('parkkaart', () => {
  test('rendert met zones en verblijven', async ({ page }) => {
    await page.goto('/kaart')
    await expectBar(page)
    await expect(page.getByTestId('park-map')).toBeVisible()
    await expect(page.getByTestId('map-base')).toBeAttached()
    expect(await page.locator('[data-place]').count()).toBeGreaterThan(5)
    await expect(page.getByTestId('place-panel')).toHaveCount(0)
  })

  test('?plek=verblijf-humboldtpinguin markeert het verblijf', async ({ page }) => {
    await page.goto('/kaart?plek=verblijf-humboldtpinguin')
    await expect(page.getByTestId('park-map')).toHaveAttribute('data-selected', 'verblijf-humboldtpinguin')
    await expect(page.locator('g.pm-enc.sel[data-place="verblijf-humboldtpinguin"]')).toBeAttached()
    await expect(page.getByTestId('place-panel')).toHaveAttribute('data-place', 'verblijf-humboldtpinguin')
    await expect(page.getByTestId('place-panel')).toContainText('Humboldt')
  })

  test('GPS binnen het park toont een stip', async ({ page, context }) => {
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({ latitude: park.center.lat, longitude: park.center.lon, accuracy: 10 })
    await page.goto('/kaart')
    await page.getByRole('button', { name: 'Waar ben ik?' }).click()
    await expect(page.getByTestId('gps-dot')).toBeAttached()
    await expect(page.getByRole('button', { name: 'Stop locatie' })).toBeVisible()
    await expect(page.getByTestId('gps-message')).not.toContainText('niet in het park')
  })

  test('GPS buiten het park (Amsterdam): melding, geen stip', async ({ page, context }) => {
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({ latitude: 52.3676, longitude: 4.9041, accuracy: 10 })
    await page.goto('/kaart')
    await page.getByRole('button', { name: 'Waar ben ik?' }).click()
    await expect(page.getByTestId('gps-message')).toContainText('Je bent niet in het park.')
    await expect(page.getByTestId('gps-dot')).toHaveCount(0)
  })

  test('GPS niet toegestaan: nette melding, kaart blijft werken', async ({ page }) => {
    await page.goto('/kaart')
    await page.getByRole('button', { name: 'Waar ben ik?' }).click()
    await expect(page.getByTestId('gps-message')).toContainText(/niet toegestaan|niet te bepalen/)
    await expect(page.getByTestId('gps-dot')).toHaveCount(0)
    await expect(page.getByTestId('park-map')).toBeVisible()
  })
})
