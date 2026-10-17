import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BundleSpecies, ParkBundle } from '../../data/types'
import { _reloadSettingsForTest } from '../../state/settings'
import { AtlasPage } from './AtlasPage'

const sp = (slug: string, name: string, o: object): BundleSpecies =>
  ({
    slug,
    name,
    name_alt: null,
    scientific_name: `Gen ${slug}`,
    iucn: null,
    zone_id: null,
    size_class: null,
    photo: { url: `u/${slug}.webp`, thumb_url: `u/${slug}-t.webp`, attribution: 0 },
    facts: { continents: [], colors: [] },
    ...o,
  }) as unknown as BundleSpecies

const bundle = {
  species: [
    sp('pinguin', 'Humboldtpinguïn', { iucn: 'VU', zone_id: 'z1', size_class: 'medium', facts: { continents: ['south-america'], colors: ['black'] } }),
    sp('flamingo', 'Flamingo', { iucn: 'LC', zone_id: 'z2', size_class: 'large', facts: { continents: ['africa'], colors: ['pink'] } }),
  ],
  places: {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: null, properties: { id: 'z1', kind: 'zone', name_nl: 'Kustvogels', name_en: 'Coast birds' } },
      { type: 'Feature', geometry: null, properties: { id: 'z2', kind: 'zone', name_nl: 'Grote vijver' } },
    ],
  },
} as unknown as ParkBundle

vi.mock('../../data/ParkDataProvider', () => ({
  useBundle: () => bundle,
  mediaUrl: (r: string) => `/${r}`,
}))

function Loc() {
  const l = useLocation()
  return <output data-testid="loc">{l.search}</output>
}

function renderAt(url = '/atlas') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <AtlasPage />
      <Loc />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  localStorage.clear()
  _reloadSettingsForTest()
})

describe('AtlasPage', () => {
  it('toont kaarten met links, naam, Latijnse naam en IUCN-badge', () => {
    renderAt()
    const link = screen.getByRole('link', { name: /Humboldtpinguïn/ })
    expect(link).toHaveAttribute('href', '/soort/pinguin')
    expect(within(link).getByText('Gen pinguin')).toBeInTheDocument()
    const img = link.querySelector('img')!
    expect(img).toHaveAttribute('width', '400')
    expect(img).toHaveAttribute('height', '300')
    expect(link.querySelector('.badge[data-iucn="VU"]')).not.toBeNull()
    expect(screen.getByText('2 soorten')).toBeInTheDocument()
  })

  it('zoekt diakriet-ongevoelig', () => {
    renderAt()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'pinguin' } })
    expect(screen.getByText('1 soort')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Flamingo/ })).toBeNull()
  })

  it('filter-chips zetten de URL en wissen werkt', () => {
    renderAt()
    fireEvent.click(screen.getByRole('button', { name: /^Filters/ }))
    const chip = screen.getByRole('button', { name: 'Roze' })
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('loc')).toHaveTextContent('k=pink')
    expect(screen.getByText('1 soort')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Wis filters' }))
    expect(screen.getByText('2 soorten')).toBeInTheDocument()
    expect(screen.getByTestId('loc')).toHaveTextContent(/^$/)
  })

  it('leest filters uit de URL en toont zonenamen', () => {
    renderAt('/atlas?z=z1&i=threatened')
    expect(screen.getByRole('button', { name: 'Kustvogels' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('1 soort')).toBeInTheDocument()
  })

  it('toont alleen waarden die voorkomen', () => {
    renderAt()
    fireEvent.click(screen.getByRole('button', { name: /^Filters/ }))
    expect(screen.queryByRole('button', { name: 'Blauw' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Azië' })).toBeNull()
  })

  it('lege staat', () => {
    renderAt('/atlas?q=zzzz')
    expect(screen.getByTestId('atlas-empty')).toHaveTextContent('Geen dieren gevonden')
  })
})
