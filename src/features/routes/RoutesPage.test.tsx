import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { BundleRoute, ParkBundle } from '../../data/types'

const route = (o: Partial<BundleRoute>): BundleRoute => ({
  id: 'kinderwagen',
  profile: 'stroller',
  title: 'Kinderwagenroute',
  intro: 'Vlak en breed.',
  note: 'Check de borden.',
  stops: [
    { place_id: 'a', name: 'Ingang', indoor: false },
    { place_id: 'b', name: 'Tropenhal', indoor: true },
  ],
  svg_points: '10,10 20,20',
  length_m: 1234,
  minutes: 35,
  concept: true,
  ...o,
})

let routes: BundleRoute[] = []
vi.mock('../../data/ParkDataProvider', () => ({ useBundle: () => ({ lang: 'nl', routes }) as unknown as ParkBundle }))

import { RoutesPage, formatLength } from './RoutesPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <RoutesPage />
    </MemoryRouter>,
  )
}

describe('formatLength', () => {
  it('meters onder 1 km, anders km met 1 decimaal', () => {
    expect(formatLength(850, 'nl')).toBe('850 m')
    expect(formatLength(1234, 'nl')).toBe('1,2 km')
    expect(formatLength(1234, 'en')).toBe('1.2 km')
    expect(formatLength(1960, 'nl')).toBe('2,0 km')
  })
})

describe('RoutesPage', () => {
  it('toont kaart met icoon, maten, concept-label, stops, note en kaartlink', () => {
    routes = [route({}), route({ id: 'kort', profile: 'short', title: 'Kort', concept: false, note: null, length_m: 600 })]
    renderPage()
    const cards = screen.getAllByTestId('route-card')
    expect(cards).toHaveLength(2)
    const c = within(cards[0]!)
    expect(c.getByText('🚼')).toBeInTheDocument()
    expect(c.getByText('Kinderwagenroute')).toBeInTheDocument()
    expect(c.getByText('1,2 km')).toBeInTheDocument()
    expect(c.getByText('35 min')).toBeInTheDocument()
    expect(c.getByText('2 stops')).toBeInTheDocument()
    expect(c.getByText('Concept: nog niet gelopen')).toBeInTheDocument()
    expect(c.getByLabelText('Overdekt')).toBeInTheDocument()
    expect(c.getByText('Check de borden.')).toBeInTheDocument()
    expect(c.getByRole('link', { name: 'Toon op de kaart' })).toHaveAttribute('href', '/kaart?route=kinderwagen')
    const k = within(cards[1]!)
    expect(k.getByText('600 m')).toBeInTheDocument()
    expect(k.queryByText('Concept: nog niet gelopen')).toBeNull()
  })

  it('lege toestand zonder routes', () => {
    routes = []
    renderPage()
    expect(screen.getByTestId('routes-empty')).toBeInTheDocument()
    expect(screen.queryByTestId('route-card')).toBeNull()
  })
})
