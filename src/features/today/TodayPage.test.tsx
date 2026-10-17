import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ParkBundle } from '../../data/types'
import { _resetAlbumForTest, emptyAlbum, today, type AlbumV1 } from '../../state/album'
import { _reloadSettingsForTest } from '../../state/settings'
import { TodayPage } from './TodayPage'

vi.mock('./card', async (orig) => {
  const real = await orig<typeof import('./card')>()
  return { ...real, loadImage: vi.fn(async () => ({}) as HTMLImageElement) }
})

function sp(slug: string, name: string, photo: boolean) {
  return {
    slug,
    name,
    photo: photo ? { url: `park/media/photos/${slug}.webp`, thumb_url: `park/media/photos/${slug}-t.webp`, attribution: 0 } : null,
  }
}

const bundle = {
  lang: 'nl',
  park: { app_name: 'Avifauna Ontdekker', park_name: 'Vogelpark Test' },
  species: [sp('flamingo', 'Flamingo', true), sp('uil', 'Uil', true), sp('kiwi', 'Kiwi', false)],
  attributions: [{ creator: 'Anna', license: 'CC BY-SA 4.0' }],
  expeditions: [],
} as unknown as ParkBundle

vi.mock('../../data/ParkDataProvider', () => ({
  useBundle: () => bundle,
  mediaUrl: (r: string) => `/${r}`,
}))

const ctxMock = new Proxy({} as Record<string, unknown>, {
  get: (t, k: string) => (k === 'measureText' ? (s: string) => ({ width: s.length * 8 }) : (t[k] ??= vi.fn())),
  set: (t, k: string, v) => ((t[k] = v), true),
})

function albumWith(seen: string[], extra: Partial<AlbumV1> = {}): AlbumV1 {
  const a = emptyAlbum()
  for (const s of seen) a.stickers[s] = { first: today(), last: today(), count: 1 }
  if (seen.length) a.days[today()] = { seen }
  return { ...a, ...extra }
}

const setup = () =>
  render(
    <MemoryRouter>
      <TodayPage />
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ctxMock as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb: BlobCallback) => cb(new Blob(['png'], { type: 'image/png' })))
})

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  _reloadSettingsForTest()
  Reflect.deleteProperty(navigator, 'canShare')
  Reflect.deleteProperty(navigator, 'share')
})

describe('TodayPage', () => {
  it('lege toestand: uitleg en links naar atlas en bingo', async () => {
    await _resetAlbumForTest(albumWith([]))
    setup()
    expect(await screen.findByTestId('today-empty')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Naar de atlas' })).toHaveAttribute('href', '/atlas')
    expect(screen.getByRole('link', { name: 'Naar de bingo' })).toHaveAttribute('href', '/bingo')
    expect(screen.queryByRole('button', { name: 'Opslaan' })).toBeNull()
  })

  it('toont de stickers van vandaag en laat een favoriet kiezen', async () => {
    await _resetAlbumForTest(albumWith(['flamingo', 'uil']))
    setup()
    expect(await screen.findByText('2 soorten gezien')).toBeInTheDocument()
    expect(screen.getByText('Uil')).toBeInTheDocument()
    // standaard is de eerste favoriet
    expect(screen.getByRole('button', { name: 'Favoriet van vandaag: Flamingo' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Maak favoriet: Uil' }))
    expect(await screen.findByRole('button', { name: 'Favoriet van vandaag: Uil' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('tekent het kaartje en biedt opslaan; delen alleen als canShare met bestanden kan', async () => {
    await _resetAlbumForTest(albumWith(['flamingo']))
    setup()
    const save = await screen.findByRole('button', { name: 'Opslaan' })
    await waitFor(() => expect(save).toBeEnabled())
    expect(screen.queryByRole('button', { name: 'Delen' })).toBeNull()
  })

  it('toont Delen en roept navigator.share met een PNG-bestand aan', async () => {
    const share = vi.fn(async () => {})
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true })
    Object.defineProperty(navigator, 'share', { configurable: true, value: share })
    await _resetAlbumForTest(albumWith(['flamingo']))
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Delen' }))
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1))
    const arg = (share.mock.calls[0] as unknown as [{ files: File[] }])[0]
    expect(arg.files[0].type).toBe('image/png')
    expect(arg.files[0].name).toBe(`vandaag-gezien-${today()}.png`)
  })

  it('Opslaan downloadt een PNG', async () => {
    const create = vi.fn(() => 'blob:x')
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: create })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    await _resetAlbumForTest(albumWith(['flamingo']))
    setup()
    const save = await screen.findByRole('button', { name: 'Opslaan' })
    await waitFor(() => expect(save).toBeEnabled())
    fireEvent.click(save)
    expect(create).toHaveBeenCalled()
    expect(click).toHaveBeenCalled()
  })
})
