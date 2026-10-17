import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ParkDataGate, ParkDataProvider } from '../../data/ParkDataProvider'
import type { ParkBundle } from '../../data/types'
import { _reloadSettingsForTest } from '../../state/settings'
import { _resetAlbumForTest, albumActions, emptyAlbum, getAlbum, today } from '../../state/album'
import { BingoPage } from './BingoPage'
import { fixtureBingo, fixtureSlugs } from './fixture'

const species = fixtureSlugs.map((slug) => ({
  slug,
  name: slug.toUpperCase(),
  photo: { url: `park/media/photos/${slug}.webp`, thumb_url: `park/media/photos/${slug}-thumb.webp`, attribution: 0 },
}))

function makeBundle(bingo: ParkBundle['bingo']) {
  return { lang: 'nl', species, places: { features: [] }, attributions: [], bingo } as unknown as ParkBundle
}

function setup(bundle: ParkBundle) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => bundle })),
  )
  return render(
    <MemoryRouter initialEntries={['/bingo']}>
      <ParkDataProvider>
        <Routes>
          <Route element={<ParkDataGate />}>
            <Route path="/bingo" element={<BingoPage />} />
            <Route path="/album" element={<p>Album</p>} />
          </Route>
        </Routes>
      </ParkDataProvider>
    </MemoryRouter>,
  )
}

const cells = () => screen.getAllByRole('button', { pressed: false }).filter((b) => b.classList.contains('bg-cell'))

beforeEach(async () => {
  await _resetAlbumForTest(emptyAlbum())
})

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
  _reloadSettingsForTest()
})

describe('BingoPage', () => {
  it('maakt een kaart van vandaag (3x3) en slaat hem op in het album', async () => {
    setup(makeBundle(fixtureBingo))
    await waitFor(() => expect(cells()).toHaveLength(9))
    expect(getAlbum().bingo?.day).toBe(today())
    expect(getAlbum().bingo?.size).toBe(9)
  })

  it('toont een nette lege toestand zonder bingo', async () => {
    setup(makeBundle(null))
    expect(await screen.findByTestId('bingo-empty')).toBeInTheDocument()
  })

  it('markeren van een soortvakje zet een sticker; ontmarkeren kan', async () => {
    setup(makeBundle(fixtureBingo))
    await waitFor(() => expect(cells()).toHaveLength(9))
    const card = getAlbum().bingo!
    const idx = card.cells.findIndex((c) => c.startsWith('s:'))
    const slug = card.cells[idx].slice(2)
    const btn = screen.getAllByRole('listitem')[idx].querySelector('button')!
    fireEvent.click(btn)
    await waitFor(() => expect(btn).toHaveAttribute('aria-pressed', 'true'))
    expect(getAlbum().stickers[slug]).toBeDefined()
    fireEvent.click(btn)
    await waitFor(() => expect(btn).toHaveAttribute('aria-pressed', 'false'))
  })

  it('een volle lijn geeft een Bingo!-melding, één keer', async () => {
    setup(makeBundle(fixtureBingo))
    await waitFor(() => expect(cells()).toHaveLength(9))
    const items = screen.getAllByRole('listitem')
    for (const i of [0, 1, 2]) fireEvent.click(items[i].querySelector('button')!)
    expect(await screen.findByText('Bingo!')).toBeInTheDocument()
    expect(getAlbum().bingo?.lines).toBe(1)
    // melding sluiten, ontmarkeren en opnieuw markeren: geen nieuwe viering
    fireEvent.click(screen.getByRole('button', { name: 'Sluiten' }))
    fireEvent.click(items[2].querySelector('button')!)
    fireEvent.click(items[2].querySelector('button')!)
    expect(screen.queryByText('Bingo!')).toBeNull()
  })

  it('een volle kaart geeft de badge bingo-vol', async () => {
    setup(makeBundle(fixtureBingo))
    await waitFor(() => expect(cells()).toHaveLength(9))
    const items = screen.getAllByRole('listitem')
    for (let i = 0; i < 9; i++) fireEvent.click(items[i].querySelector('button')!)
    expect(await screen.findByText('Volle kaart!')).toBeInTheDocument()
    expect(getAlbum().badges['bingo-vol']).toBeDefined()
  })

  it('nieuwe kaart vraagt bevestiging; 4x4 wisselt de grootte', async () => {
    setup(makeBundle(fixtureBingo))
    await waitFor(() => expect(cells()).toHaveLength(9))
    const first = getAlbum().bingo!.cells
    fireEvent.click(screen.getAllByRole('listitem')[0].querySelector('button')!)
    fireEvent.click(screen.getByRole('button', { name: 'Nieuwe kaart' }))
    fireEvent.click(screen.getByRole('button', { name: 'Nee, houd deze' }))
    expect(getAlbum().bingo!.cells).toEqual(first)
    fireEvent.click(screen.getByRole('button', { name: '4×4' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ja, nieuwe kaart' }))
    await waitFor(() => expect(getAlbum().bingo!.size).toBe(16))
    expect(getAlbum().bingo!.marked).toEqual([])
  })

  it('een kaart van gisteren wordt vervangen door een nieuwe van vandaag', async () => {
    await _resetAlbumForTest({ ...emptyAlbum(), bingo: { day: '2020-01-01', size: 9, seed: 1, cells: [], marked: [], lines: 0 } })
    setup(makeBundle(fixtureBingo))
    await waitFor(() => expect(getAlbum().bingo?.day).toBe(today()))
    await act(async () => albumActions.setBingo(getAlbum().bingo))
  })
})
