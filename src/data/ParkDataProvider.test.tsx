import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { _reloadSettingsForTest } from '../state/settings'
import { mediaUrl, ParkDataGate, ParkDataProvider, useBundle, useSpecies } from './ParkDataProvider'
import type { ParkBundle } from './types'

const bundle = {
  lang: 'nl',
  species: [{ slug: 'a-b', name: 'Test' }],
  places: { features: [] },
} as unknown as ParkBundle

function Probe() {
  const b = useBundle()
  const s = useSpecies('a-b')
  return (
    <p>
      {b.species.length}:{s?.name}
    </p>
  )
}

function setup() {
  return render(
    <MemoryRouter>
      <ParkDataProvider>
        <Routes>
          <Route element={<ParkDataGate />}>
            <Route index element={<Probe />} />
          </Route>
        </Routes>
      </ParkDataProvider>
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
  _reloadSettingsForTest()
})

describe('ParkDataProvider', () => {
  it('toont laadscherm en dan de inhoud', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => bundle })
    vi.stubGlobal('fetch', fetchMock)
    setup()
    expect(screen.getByTestId('park-loading')).toBeInTheDocument()
    expect(await screen.findByText('1:Test')).toBeInTheDocument()
    expect(fetchMock.mock.calls[0][0]).toBe('/park/data.nl.json')
  })

  it('toont foutscherm bij mislukte fetch en laadt opnieuw na klik', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValue({ ok: true, json: async () => bundle })
    vi.stubGlobal('fetch', fetchMock)
    setup()
    const err = await screen.findByTestId('park-error')
    expect(err).toBeInTheDocument()
    screen.getByRole('button').click()
    await waitFor(() => expect(screen.getByText('1:Test')).toBeInTheDocument())
  })

  it('mediaUrl plakt base ervoor', () => {
    expect(mediaUrl('park/media/x.webp')).toBe('/park/media/x.webp')
    expect(mediaUrl('/park/media/x.webp')).toBe('/park/media/x.webp')
  })
})
