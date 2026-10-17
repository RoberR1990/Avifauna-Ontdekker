import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ParkBundle } from '../../data/types'
import type { PlacesCollection } from '../../park/types'
import { featureBounds, featureCentroid, locateInPark } from './geometry'

const raw = (m: Record<string, unknown>) => JSON.parse(Object.values(m)[0] as string)
const georef = raw(import.meta.glob('../../../parks/avifauna/map/georef.json', { query: '?raw', import: 'default', eager: true }))
const places = raw(import.meta.glob('../../../parks/avifauna/places.geojson', { query: '?raw', import: 'default', eager: true })) as PlacesCollection
const center = { lat: 52.1393, lon: 4.649 }

const bundle = {
  lang: 'nl',
  park: { center },
  places,
  map: { url: '/park/map/map-base.svg', georef },
  species: [
    { slug: 'humboldtpinguin', name: 'Humboldtpinguïn', place_id: 'verblijf-humboldtpinguin', zone_id: 'zone-grote-vijver' },
  ],
} as unknown as ParkBundle

vi.mock('../../data/ParkDataProvider', () => ({ useBundle: () => bundle }))

import { ParkMapPage } from './ParkMapPage'

const affine = georef.affine
const mapSize = { w: georef.svg.width as number, h: georef.svg.height as number }

describe('projectie van de overlay', () => {
  it('elk zonezwaartepunt valt binnen de viewBox', () => {
    const zones = places.features.filter((f) => f.properties.kind === 'zone')
    expect(zones.length).toBeGreaterThan(5)
    for (const z of zones) {
      const c = featureCentroid(z, affine)
      expect(c.x).toBeGreaterThanOrEqual(0)
      expect(c.x).toBeLessThanOrEqual(mapSize.w)
      expect(c.y).toBeGreaterThanOrEqual(0)
      expect(c.y).toBeLessThanOrEqual(mapSize.h)
      const b = featureBounds(z, affine)
      expect(c.x).toBeGreaterThanOrEqual(b.minX)
      expect(c.x).toBeLessThanOrEqual(b.maxX)
    }
  })
  it('locateInPark: park en buiten park', () => {
    expect(locateInPark(affine, mapSize, center, { lat: 52.1393, lon: 4.649, accuracy: 10 }).inside).toBe(true)
    expect(locateInPark(affine, mapSize, center, { lat: 52.37, lon: 4.9 }).inside).toBe(false)
  })
})

function renderMap(path = '/kaart') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ParkMapPage />
    </MemoryRouter>,
  )
}

describe('ParkMapPage', () => {
  it('toont concept-melding, zones, verblijven en voorzieningen', () => {
    const { container } = renderMap()
    expect(screen.getByText('Concept-kaart: zones nog niet gecontroleerd')).toBeInTheDocument()
    expect(container.querySelectorAll('.pm-zone')).toHaveLength(9)
    expect(container.querySelectorAll('.pm-enc').length).toBeGreaterThan(10)
    expect(container.querySelectorAll('.pm-fac').length).toBeGreaterThan(5)
    expect(screen.getByText('Je locatie blijft op je telefoon.')).toBeInTheDocument()
  })

  it('?plek= markeert en zoomt in op het verblijf, met soortlink', () => {
    renderMap('/kaart?plek=verblijf-humboldtpinguin')
    const svg = screen.getByTestId('park-map')
    expect(svg.getAttribute('data-selected')).toBe('verblijf-humboldtpinguin')
    const vb = svg.getAttribute('viewBox')!.split(' ').map(Number)
    expect(vb[2]).toBeLessThan(mapSize.w) // ingezoomd
    expect(screen.getByRole('link', { name: 'Humboldtpinguïn' })).toHaveAttribute('href', '/soort/humboldtpinguin')
  })

  it('tik op een verblijf opent het paneel', () => {
    const { container } = renderMap()
    fireEvent.click(container.querySelector('[data-place="verblijf-humboldtpinguin"]')!)
    expect(screen.getByTestId('place-panel')).toHaveAttribute('data-place', 'verblijf-humboldtpinguin')
  })

  it('zoomknoppen veranderen de viewBox', () => {
    renderMap()
    const w0 = Number(screen.getByTestId('park-map').getAttribute('viewBox')!.split(' ')[2])
    fireEvent.click(screen.getByRole('button', { name: 'Inzoomen' }))
    const w1 = Number(screen.getByTestId('park-map').getAttribute('viewBox')!.split(' ')[2])
    expect(w1).toBeLessThan(w0)
  })
})

describe('GPS', () => {
  type Success = (p: GeolocationPosition) => void
  type Failure = (e: GeolocationPositionError) => void
  let ok: Success
  let fail: Failure
  const watch = vi.fn()
  const clear = vi.fn()

  beforeEach(() => {
    watch.mockImplementation((s: Success, f: Failure) => {
      ok = s
      fail = f
      return 7
    })
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: watch, clearWatch: clear } })
  })
  afterEach(() => {
    watch.mockReset()
    clear.mockReset()
  })

  const pos = (lat: number, lon: number) => ({ coords: { latitude: lat, longitude: lon, accuracy: 12 } }) as GeolocationPosition

  it('vraagt pas na tik om locatie', () => {
    renderMap()
    expect(watch).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Waar ben ik?' }))
    expect(watch).toHaveBeenCalledTimes(1)
    expect(watch.mock.calls[0]![2]).toMatchObject({ enableHighAccuracy: true })
  })

  it('in het park: stip met nauwkeurigheidscirkel; uitzetten stopt het volgen', () => {
    renderMap()
    fireEvent.click(screen.getByRole('button', { name: 'Waar ben ik?' }))
    act(() => ok(pos(52.1393, 4.649)))
    expect(screen.getByTestId('gps-dot')).toBeInTheDocument()
    expect(screen.getByTestId('gps-accuracy')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Stop locatie' }))
    expect(clear).toHaveBeenCalledWith(7)
    expect(screen.queryByTestId('gps-dot')).toBeNull()
  })

  it('buiten het park: melding en geen stip', () => {
    renderMap()
    fireEvent.click(screen.getByRole('button', { name: 'Waar ben ik?' }))
    act(() => ok(pos(52.37, 4.9)))
    expect(screen.queryByTestId('gps-dot')).toBeNull()
    expect(screen.getByTestId('gps-message')).toHaveTextContent('Je bent niet in het park.')
  })

  it('geweigerd: vriendelijke melding', () => {
    renderMap()
    fireEvent.click(screen.getByRole('button', { name: 'Waar ben ik?' }))
    act(() => fail({ code: 1, message: '', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }))
    expect(screen.getByTestId('gps-message')).toHaveTextContent('niet toegestaan')
    expect(screen.queryByTestId('gps-dot')).toBeNull()
  })

  it('unmount stopt het volgen', () => {
    const { unmount } = renderMap()
    fireEvent.click(screen.getByRole('button', { name: 'Waar ben ik?' }))
    unmount()
    expect(clear).toHaveBeenCalledWith(7)
  })
})
