import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ParkDataGate, ParkDataProvider } from '../../data/ParkDataProvider'
import { _resetAlbumForTest, getAlbum } from '../../state/album'
import { _reloadSettingsForTest } from '../../state/settings'
import type { Fix, GeoStatus } from '../map/useGeolocation'
import { ExpeditionPage } from './ExpeditionPage'
import { EXP1, EXP2, FAR, INSIDE, makeBundle } from './fixture'

const geo: { status: GeoStatus; fix: Fix | null } = { status: 'idle', fix: null }
const geoEnabled = vi.fn()
vi.mock('../map/useGeolocation', () => ({
  useGeolocation: (enabled: boolean) => {
    geoEnabled(enabled)
    return enabled ? geo : { status: 'idle', fix: null }
  },
}))

function setup(path = '/expeditie/e1') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ParkDataProvider>
        <Routes>
          <Route element={<ParkDataGate />}>
            <Route path="/expeditie/:id" element={<ExpeditionPage />} />
          </Route>
          <Route path="/spelen" element={<p>Spelen-hub</p>} />
        </Routes>
      </ParkDataProvider>
    </MemoryRouter>,
  )
}

const stopBtn = (name: RegExp) => screen.getByRole('button', { name })

beforeEach(async () => {
  geo.status = 'idle'
  geo.fix = null
  geoEnabled.mockClear()
  await _resetAlbumForTest()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => makeBundle([EXP1, EXP2]) })),
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  localStorage.clear()
  _reloadSettingsForTest()
})

describe('ExpeditionPage', () => {
  it('onbekend id: nette melding met link naar Spelen', async () => {
    setup('/expeditie/bestaat-niet')
    expect(await screen.findByTestId('ex-unknown')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'Naar Spelen' }))
    expect(screen.getByText('Spelen-hub')).toBeInTheDocument()
  })

  it('buitenstop staat op slot zonder fix en GPS staat uit tot er getikt wordt', async () => {
    setup()
    await screen.findByRole('heading', { name: /Vogelspeurtocht/ })
    expect(stopBtn(/Bij de vijver/)).toHaveAttribute('data-status', 'locked')
    expect(screen.queryByRole('button', { name: 'Gevonden!' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Zoek mijn plek' })).toBeInTheDocument()
    expect(geoEnabled).not.toHaveBeenCalledWith(true)
  })

  it('met een fix in de zone gaat de stop open; Gevonden! telt als gedaan', async () => {
    geo.status = 'active'
    geo.fix = INSIDE
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Zoek mijn plek' }))
    expect(geoEnabled).toHaveBeenCalledWith(true)
    fireEvent.click(await screen.findByRole('button', { name: 'Gevonden!' }))
    expect(getAlbum().expeditions.e1.done.s1).toBeTruthy()
    expect(screen.getByTestId('ex-progress')).toHaveTextContent('1 van 4')
    // soortlink + foto op de soortstop
    fireEvent.click(stopBtn(/Bij de vijver/))
    expect(screen.getByRole('link', { name: /Aap/ })).toHaveAttribute('href', '/soort/aap')
  })

  it('een fix ver buiten de zone houdt de stop op slot', async () => {
    geo.status = 'active'
    geo.fix = FAR
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Zoek mijn plek' }))
    expect(stopBtn(/Bij de vijver/)).toHaveAttribute('data-status', 'locked')
    expect(screen.queryByRole('button', { name: 'Gevonden!' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Ik sta er' })).toBeNull()
  })

  it('binnenstop is altijd open, zonder GPS', async () => {
    setup()
    fireEvent.click(await screen.findByRole('button', { name: /Stop s2/ }))
    expect(stopBtn(/Stop s2/)).toHaveAttribute('data-status', 'open')
    expect(screen.getByRole('button', { name: 'Rood' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Zoek mijn plek' })).toBeNull()
    expect(geoEnabled).not.toHaveBeenCalledWith(true)
  })

  it('choose: fout geeft de hint en opnieuw proberen, goed telt', async () => {
    setup()
    fireEvent.click(await screen.findByRole('button', { name: /Stop s2/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Groen' }))
    expect(screen.getByText('Kijk naar het bordje.')).toBeInTheDocument()
    expect(getAlbum().expeditions.e1).toBeUndefined()
    fireEvent.click(screen.getByRole('button', { name: 'Blauw' }))
    expect(getAlbum().expeditions.e1.done.s2).toBeTruthy()
  })

  it('count met answer wordt gecontroleerd', async () => {
    setup()
    fireEvent.click(await screen.findByRole('button', { name: /Stop s3/ }))
    const plus = screen.getByRole('button', { name: 'Een erbij' })
    fireEvent.click(plus)
    fireEvent.click(screen.getByRole('button', { name: 'Controleren' }))
    expect(screen.getByText('Tel nog eens.')).toBeInTheDocument()
    expect(getAlbum().expeditions.e1).toBeUndefined()
    fireEvent.click(plus)
    fireEvent.click(plus)
    fireEvent.click(screen.getByRole('button', { name: 'Controleren' }))
    expect(getAlbum().expeditions.e1.done.s3).toBeTruthy()
  })

  it('terugval: bij geweigerde GPS ontgrendelt "Ik sta er" de stop', async () => {
    geo.status = 'denied'
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Zoek mijn plek' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Ik sta er' }))
    expect(await screen.findByRole('button', { name: 'Gevonden!' })).toBeInTheDocument()
    expect(stopBtn(/Bij de vijver/)).toHaveAttribute('data-status', 'open')
  })

  it('terugval: na 60 s zonder goede fix verschijnt "Ik sta er"', async () => {
    geo.status = 'searching'
    setup()
    const find = await screen.findByRole('button', { name: 'Zoek mijn plek' })
    vi.useFakeTimers()
    fireEvent.click(find)
    expect(screen.queryByRole('button', { name: 'Ik sta er' })).toBeNull()
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(screen.getByRole('button', { name: 'Ik sta er' })).toBeInTheDocument()
  })

  it('terugval komt niet bij een slechte fix die toch nauwkeurig genoeg is', async () => {
    geo.status = 'active'
    geo.fix = { ...FAR, accuracy: 20 }
    setup()
    const find = await screen.findByRole('button', { name: 'Zoek mijn plek' })
    vi.useFakeTimers()
    fireEvent.click(find)
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(screen.queryByRole('button', { name: 'Ik sta er' })).toBeNull()
  })

  it('alle stops klaar: badge wordt toegekend en het feestscherm met albumlink verschijnt', async () => {
    setup('/expeditie/e2')
    fireEvent.click(await screen.findByRole('button', { name: 'Fout' }))
    expect(screen.queryByTestId('ex-party')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Goed' }))
    expect(getAlbum().expeditions.e2.completed).toBeTruthy()
    expect(getAlbum().badges['badge-e2']).toBeTruthy()
    expect(screen.getByTestId('ex-party')).toHaveTextContent('Kort maar krachtig')
    expect(screen.getByRole('link', { name: 'Naar je album' })).toHaveAttribute('href', '/album')
  })

  it('toont de kaartlink en opnieuw beginnen vraagt om bevestiging', async () => {
    setup('/expeditie/e2')
    fireEvent.click(await screen.findByRole('button', { name: 'Goed' }))
    expect(screen.getByRole('link', { name: 'Toon op de kaart' })).toHaveAttribute('href', '/kaart?plek=zone-a')
    fireEvent.click(screen.getByRole('button', { name: 'Opnieuw beginnen' }))
    fireEvent.click(screen.getByRole('button', { name: 'Nee, laat maar' }))
    expect(getAlbum().expeditions.e2).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Opnieuw beginnen' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ja, opnieuw' }))
    expect(getAlbum().expeditions.e2).toBeUndefined()
    expect(screen.queryByTestId('ex-party')).toBeNull()
  })
})
