import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ParkBundle } from '../../data/types'
import { _reloadSettingsForTest } from '../../state/settings'
import { fixtureProgramme } from './fixture'
import { ProgrammeStrip } from './ProgrammeStrip'

let bundle: ParkBundle | null = null
vi.mock('../../data/ParkDataProvider', () => ({
  useParkData: () => ({ bundle, status: bundle ? 'ready' : 'loading' }),
}))

function makeBundle(programme = fixtureProgramme, programmeLink: string | null = 'https://example.org/programma-live'): ParkBundle {
  return {
    lang: 'nl',
    park: { links: { official_site: 'https://example.org', programme: programmeLink } },
    places: {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: { id: 'verblijf-pinguin', name_nl: 'Grote Vijver' } }],
    },
    programme,
  } as unknown as ParkBundle
}

const setup = () =>
  render(
    <MemoryRouter>
      <ProgrammeStrip />
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 17, 14, 0, 0))
})

afterEach(() => {
  vi.useRealTimers()
  localStorage.clear()
  _reloadSettingsForTest()
  bundle = null
})

describe('ProgrammeStrip', () => {
  it('rendert niets zonder bundel', () => {
    const { container } = setup()
    expect(container).toBeEmptyDOMElement()
  })

  it('rendert niets bij een leeg programma', () => {
    bundle = makeBundle({ last_checked: '2026-10-10', source_url: '', items: [] })
    const { container } = setup()
    expect(container).toBeEmptyDOMElement()
  })

  it('toont het eerstvolgende item met plaats, link, disclaimer en datum', () => {
    bundle = makeBundle()
    setup()
    expect(screen.getByText('Over 12 min:')).toBeInTheDocument()
    expect(screen.getByText(/Pinguïns voeren/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Grote Vijver' })).toHaveAttribute('href', '/kaart?plek=verblijf-pinguin')
    const official = screen.getByRole('link', { name: /Tijden kunnen wijzigen/ })
    expect(official).toHaveAttribute('href', 'https://example.org/programma-live')
    expect(screen.getByText(/laatst gecontroleerd: /)).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  it('valt terug op de officiële site als er geen programma-link is', () => {
    bundle = makeBundle(fixtureProgramme, null)
    setup()
    expect(screen.getByRole('link', { name: /Tijden kunnen wijzigen/ })).toHaveAttribute('href', 'https://example.org')
  })

  it('herinnering meldt 5 min vooraf in de app, zonder Notification-API', () => {
    bundle = makeBundle()
    setup()
    const status = screen.getByRole('status')
    expect(status).toBeEmptyDOMElement()
    // Pinguïns: 12 min; herinnering na 7 min.
    fireEvent.click(screen.getAllByRole('button', { name: 'Herinner me' })[0])
    expect(screen.getAllByRole('button', { name: 'Herinnering staat aan' })).toHaveLength(1)
    act(() => {
      vi.advanceTimersByTime(6 * 60_000)
    })
    expect(status).toBeEmptyDOMElement()
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(status).toHaveTextContent('Over 5 minuten: Pinguïns voeren')
  })
})
