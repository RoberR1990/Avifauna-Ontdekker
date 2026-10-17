import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { BundleRoute, ParkBundle } from '../../data/types'
import type { PlacesCollection } from '../../park/types'

const raw = (m: Record<string, unknown>) => JSON.parse(Object.values(m)[0] as string)
const georef = raw(import.meta.glob('../../../parks/avifauna/map/georef.json', { query: '?raw', import: 'default', eager: true }))
const places = raw(import.meta.glob('../../../parks/avifauna/places.geojson', { query: '?raw', import: 'default', eager: true })) as PlacesCollection

const route: BundleRoute = {
  id: 'test',
  profile: 'short',
  title: 'Testroute',
  intro: '',
  note: null,
  stops: [
    { place_id: 'verblijf-humboldtpinguin', name: 'Pinguins', indoor: false },
    { place_id: 'bestaat-niet', name: 'Weg', indoor: false },
    { place_id: 'zone-grote-vijver', name: 'Vijver', indoor: false },
  ],
  svg_points: '100,100 200,150 300,120',
  length_m: 500,
  minutes: 15,
  concept: true,
}

const bundle = {
  lang: 'nl',
  park: { center: { lat: 52.1393, lon: 4.649 } },
  places,
  map: { url: '/park/map/map-base.svg', georef },
  species: [],
  routes: [route],
} as unknown as ParkBundle

vi.mock('../../data/ParkDataProvider', () => ({ useBundle: () => bundle }))

import { ParkMapPage } from './ParkMapPage'

const renderMap = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ParkMapPage />
    </MemoryRouter>,
  )

describe('kaart met ?route=', () => {
  it('toont polyline, genummerde stops en banner met sluitlink', () => {
    renderMap('/kaart?route=test')
    expect(screen.getByTestId('route-line').getAttribute('points')).toBe('100,100 200,150 300,120')
    const stops = screen.getAllByTestId('route-stop')
    expect(stops.map((s) => s.textContent)).toEqual(['1', '3']) // onbekende place overgeslagen, nummering blijft
    expect(screen.getByTestId('route-banner')).toHaveTextContent('Testroute')
    expect(screen.getByRole('link', { name: 'Sluit route' })).toHaveAttribute('href', '/kaart')
  })

  it('past het zichtvenster aan op de route', () => {
    renderMap('/kaart?route=test')
    const vb = screen.getByTestId('park-map').getAttribute('viewBox')!.split(' ').map(Number)
    expect(vb[2]).toBeLessThan(georef.svg.width)
  })

  it('onbekende route-id wordt genegeerd', () => {
    renderMap('/kaart?route=onbekend')
    expect(screen.queryByTestId('route-layer')).toBeNull()
    expect(screen.queryByTestId('route-banner')).toBeNull()
  })

  it('?plek= werkt naast de route', () => {
    renderMap('/kaart?route=test&plek=verblijf-humboldtpinguin')
    expect(screen.getByTestId('park-map').getAttribute('data-selected')).toBe('verblijf-humboldtpinguin')
    expect(screen.getByTestId('route-layer')).toBeInTheDocument()
  })
})
