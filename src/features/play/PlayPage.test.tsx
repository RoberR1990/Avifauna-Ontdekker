import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ParkDataGate, ParkDataProvider } from '../../data/ParkDataProvider'
import type { BundleExpedition } from '../../data/types'
import { EXP1, EXP2, makeBundle } from '../expeditions/fixture'
import { _resetAlbumForTest, albumActions } from '../../state/album'
import { _reloadSettingsForTest } from '../../state/settings'
import { PlayPage } from './PlayPage'

function setup(expeditions: BundleExpedition[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => makeBundle(expeditions) })),
  )
  return render(
    <MemoryRouter initialEntries={['/spelen']}>
      <ParkDataProvider>
        <Routes>
          <Route element={<ParkDataGate />}>
            <Route path="/spelen" element={<PlayPage />} />
          </Route>
        </Routes>
      </ParkDataProvider>
    </MemoryRouter>,
  )
}

beforeEach(async () => {
  await _resetAlbumForTest()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  localStorage.clear()
  _reloadSettingsForTest()
})

describe('PlayPage', () => {
  it('toont expedities met leeftijd, minuten, badge en voortgang, plus de andere kaarten', async () => {
    albumActions.markStop('e1', 's1')
    setup([EXP1])
    const link = await screen.findByRole('link', { name: /Vogelspeurtocht/ })
    expect(link).toHaveAttribute('href', '/expeditie/e1')
    expect(link).toHaveTextContent('4-6 jaar')
    expect(link).toHaveTextContent('30 min')
    expect(link).toHaveTextContent('🔍')
    expect(link).toHaveTextContent('1/4')
    expect(screen.getByRole('link', { name: /Vogelbingo/ })).toHaveAttribute('href', '/bingo')
    expect(screen.getByRole('link', { name: /Routes/ })).toHaveAttribute('href', '/routes')
    expect(screen.getByRole('link', { name: /Album/ })).toHaveAttribute('href', '/album')
  })

  it('een voltooide expeditie toont "Klaar"', async () => {
    albumActions.markStop('e2', 't1')
    albumActions.completeExpedition('e2', 'badge-e2')
    setup([EXP2])
    const link = await screen.findByRole('link', { name: /Korte tocht/ })
    expect(within(link).getByText('Klaar ✓')).toBeInTheDocument()
  })

  it('verbergt expedities buiten hun seizoen', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 6, 1, 12) })
    setup([EXP1, { ...EXP2, season: { from: '11-15', to: '02-15' } }])
    await screen.findByRole('link', { name: /Vogelspeurtocht/ })
    expect(screen.queryByRole('link', { name: /Korte tocht/ })).toBeNull()
  })

  it('zonder expedities: nette lege toestand en de overige kaarten blijven', async () => {
    setup([])
    expect(await screen.findByTestId('play-empty')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Vogelbingo/ })).toBeInTheDocument()
  })
})
