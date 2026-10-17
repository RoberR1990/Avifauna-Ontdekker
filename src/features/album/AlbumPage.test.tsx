import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ParkBundle } from '../../data/types'
import { wrapLines } from './sheet'
import { _resetAlbumForTest, albumActions, getAlbum, today } from '../../state/album'
import { _reloadSettingsForTest } from '../../state/settings'
import { AlbumPage } from './AlbumPage'

const sp = (slug: string, name: string, continents: string[] = []) => ({
  slug,
  name,
  status: 'confirmed',
  photo: { url: `p/${slug}.webp`, thumb_url: `p/${slug}-t.webp`, attribution: 0 },
  facts: { continents },
})

const bundle = {
  park: { id: 'avifauna', app_name: 'Avifauna Ontdekker', footer: { nl: 'Onofficiële gids' } },
  attributions: [{ creator: 'Maker X', license: 'CC-BY-SA-4.0', source_url: 'https://commons.wikimedia.org/wiki/File:X.jpg' }],
  species: [sp('a', 'Aap'), sp('b', 'Beer'), sp('c', 'Chinchilla')],
  expeditions: [{ id: 'e', title: 'Route', badge: { id: 'bx', name: 'Routebadge', icon: '🐧' }, stops: [] }],
} as unknown as ParkBundle

vi.mock('../../data/ParkDataProvider', () => ({
  useBundle: () => bundle,
  mediaUrl: (r: string) => `/${r}`,
}))

const trackSpy = vi.hoisted(() => vi.fn())
vi.mock('./track-stubs', () => ({ albumExport: trackSpy, stickerAdd: vi.fn() }))

function setup() {
  return render(
    <MemoryRouter>
      <AlbumPage />
    </MemoryRouter>,
  )
}

beforeEach(async () => {
  localStorage.clear()
  _reloadSettingsForTest()
  await _resetAlbumForTest()
  trackSpy.mockClear()
})

describe('AlbumPage', () => {
  it('heeft fotobronnen (maker, licentie, bron) voor print bij gevonden stickers', () => {
    albumActions.addSticker('a', '2026-10-01')
    setup()
    const credits = screen.getByTestId('album-credits')
    expect(credits).toHaveTextContent('Aap: Maker X · CC-BY-SA-4.0 · https://commons.wikimedia.org/wiki/File:X.jpg')
    expect(credits).toHaveTextContent('Onofficiële gids')
  })

  it('wrapLines breekt lange attributie af', () => {
    const lines = wrapLines((s) => s.length, 'een twee drie vier vijf', 9)
    expect(lines).toEqual(['een twee', 'drie vier', 'vijf'])
  })

  it('toont waarschuwing, teller, gevonden en niet-gevonden stickers', () => {
    albumActions.addSticker('a', '2026-10-01')
    setup()
    expect(screen.getByText(/staat alleen op dit toestel/)).toBeInTheDocument()
    expect(screen.getByTestId('album-count')).toHaveTextContent('1 van 3')
    expect(screen.getAllByTestId('sticker-found')).toHaveLength(1)
    expect(screen.getByAltText('Aap')).toBeInTheDocument()
    expect(screen.getAllByTestId('sticker-empty')).toHaveLength(2)
    // geen spoiler van de naam
    expect(screen.queryByText('Beer')).toBeNull()
    expect(screen.getAllByRole('img', { name: 'Nog niet gevonden' })).toHaveLength(2)
  })

  it('toont melding als het album niet bewaard wordt (geen IndexedDB)', async () => {
    setup()
    expect(await screen.findByText(/wordt niet bewaard/)).toBeInTheDocument()
  })

  it('kent drempelbadges toe en toont badges verdiend/niet verdiend', async () => {
    albumActions.addSticker('a', '2026-10-01')
    setup()
    await waitFor(() => expect(getAlbum().badges['eerste-sticker']).toBeDefined())
    await waitFor(() => expect(screen.getAllByTestId('badge-earned').length).toBeGreaterThan(0))
    expect(screen.getAllByTestId('badge-locked').length).toBeGreaterThan(0)
    expect(screen.getByText('Routebadge')).toBeInTheDocument()
  })

  it('link naar Vandaag alleen als er vandaag stickers zijn', () => {
    const { unmount } = setup()
    expect(screen.queryByRole('link', { name: /Vandaag gezien/ })).toBeNull()
    unmount()
    albumActions.addSticker('a', today())
    setup()
    expect(screen.getByRole('link', { name: /Vandaag gezien \(1\)/ })).toHaveAttribute('href', '/vandaag')
  })

  it('back-up maken roept exportFile aan; terugzetten voegt samen en meldt het resultaat', async () => {
    albumActions.addSticker('a', '2026-10-01')
    const spy = vi.spyOn(albumActions, 'exportFile')
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Back-up maken' }))
    expect(spy).toHaveBeenCalledWith('avifauna')
    expect(trackSpy).toHaveBeenCalledWith('json')

    const backup = {
      app: 'avifauna-ontdekker-album',
      park: 'avifauna',
      exported: '2026-10-17T00:00:00Z',
      album: { v: 1, stickers: { b: { first: '2026-10-02', last: '2026-10-02', count: 1 } }, days: {}, badges: {}, expeditions: {}, bingo: null },
    }
    const input = screen.getByTestId('album-file') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File([JSON.stringify(backup)], 'b.json', { type: 'application/json' })] } })
    expect(await screen.findByText(/Nieuwe soorten: 1/)).toBeInTheDocument()
    expect(getAlbum().stickers.b).toBeDefined()
    expect(screen.getByTestId('album-count')).toHaveTextContent('2 van 3')

    fireEvent.change(input, { target: { files: [new File(['kapot'], 'x.json')] } })
    expect(await screen.findByText(/geen geldige back-up/)).toBeInTheDocument()
    spy.mockRestore()
  })

  it('afbeelding opslaan zonder stickers geeft een melding; printen roept window.print aan', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Afbeelding opslaan' }))
    expect(screen.getByTestId('album-message')).toHaveTextContent('Verzamel eerst een sticker')
    fireEvent.click(screen.getByRole('button', { name: 'Printen' }))
    expect(print).toHaveBeenCalled()
    expect(trackSpy).toHaveBeenCalledWith('print')
    print.mockRestore()
  })
})
