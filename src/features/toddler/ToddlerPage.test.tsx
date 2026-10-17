import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ParkDataGate, ParkDataProvider } from '../../data/ParkDataProvider'
import type { ParkBundle } from '../../data/types'
import { _reloadSettingsForTest } from '../../state/settings'
import { ToddlerPage } from './ToddlerPage'

const speakMock = vi.fn<(...args: unknown[]) => boolean>(() => true)
vi.mock('../../lib/speech', () => ({
  speak: (...a: unknown[]) => speakMock(...a),
  stop: vi.fn(),
  isSupported: () => true,
}))

function sp(slug: string, name: string, photo: boolean) {
  return {
    slug,
    name,
    audio: null,
    photo: photo
      ? { url: `park/media/photos/${slug}.webp`, thumb_url: `park/media/photos/${slug}-thumb.webp`, attribution: 0 }
      : null,
  }
}

const bundle = {
  lang: 'nl',
  species: [sp('a', 'Aap', true), sp('b', 'Beer', false), sp('c', 'Chinchilla', true), sp('d', 'Dodo', true)],
  places: { features: [] },
  attributions: [{ creator: 'Jan', license: 'CC BY 4.0' }],
} as unknown as ParkBundle

function setup() {
  return render(
    <MemoryRouter initialEntries={['/peuter']}>
      <ParkDataProvider>
        <Routes>
          <Route element={<ParkDataGate />}>
            <Route path="/peuter" element={<ToddlerPage />} />
          </Route>
          <Route path="/" element={<p>Start</p>} />
        </Routes>
      </ParkDataProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  speakMock.mockClear()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => bundle })),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
  _reloadSettingsForTest()
})

describe('ToddlerPage', () => {
  it('toont alleen soorten met foto', async () => {
    setup()
    await screen.findByText('Aap')
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.queryByText('Beer')).toBeNull()
  })

  it('tik opent detail, leest de naam voor en toont attributie', async () => {
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Aap' }))
    expect(screen.getByRole('dialog', { name: 'Aap' })).toBeInTheDocument()
    expect(speakMock).toHaveBeenCalledWith('Aap', 'nl', 'kind', expect.any(Function))
    expect(screen.getByText(/Jan · CC BY 4.0/)).toBeInTheDocument()
  })

  it('volgende en vorige wisselen van dier (rond), en voorlezen volgt', async () => {
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Aap' }))
    fireEvent.click(screen.getByRole('button', { name: 'Volgende dier' }))
    expect(screen.getByRole('dialog', { name: 'Chinchilla' })).toBeInTheDocument()
    expect(speakMock).toHaveBeenLastCalledWith('Chinchilla', 'nl', 'kind', expect.any(Function))
    fireEvent.click(screen.getByRole('button', { name: 'Vorige dier' }))
    fireEvent.click(screen.getByRole('button', { name: 'Vorige dier' }))
    expect(screen.getByRole('dialog', { name: 'Dodo' })).toBeInTheDocument()
  })

  it('swipe naar links gaat naar het volgende dier; nog een keer horen leest opnieuw voor', async () => {
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Aap' }))
    const dlg = screen.getByRole('dialog')
    fireEvent.pointerDown(dlg, { clientX: 300, clientY: 200 })
    fireEvent.pointerUp(dlg, { clientX: 100, clientY: 210 })
    expect(screen.getByRole('dialog', { name: 'Chinchilla' })).toBeInTheDocument()
    speakMock.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Nog een keer horen' }))
    expect(speakMock).toHaveBeenCalledTimes(1)
  })

  it('terug naar raster sluit het detail', async () => {
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Aap' }))
    fireEvent.click(screen.getByRole('button', { name: 'Terug naar alle dieren' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Klaar werkt pas na 1 seconde ingedrukt houden', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      setup()
      const btn = await screen.findByRole('button', { name: /Klaar/ })
      fireEvent.pointerDown(btn)
      vi.advanceTimersByTime(400)
      fireEvent.pointerUp(btn)
      vi.advanceTimersByTime(1500)
      expect(screen.queryByText('Start')).toBeNull()
      fireEvent.pointerDown(btn)
      vi.advanceTimersByTime(1100)
      await waitFor(() => expect(screen.getByText('Start')).toBeInTheDocument())
    } finally {
      vi.useRealTimers()
    }
  })
})
